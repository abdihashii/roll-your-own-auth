import type { MiddlewareHandler } from 'hono';

import { ApiErrorCode } from '@roll-your-own-auth/shared/types';
import { eq, sql } from 'drizzle-orm';
import { getCookie, setCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';

import { authUsersTable, profilesTable } from '@/db/schema';
import env from '@/env';
import {
  ACCESS_TOKEN_COOKIE_NAME_DEV,
  ACCESS_TOKEN_COOKIE_NAME_PROD,
  REFRESH_TOKEN_COOKIE_NAME_DEV,
  REFRESH_TOKEN_COOKIE_NAME_PROD,
} from '@/lib/constants';
import { createApiResponse, refreshAccessToken } from '@/lib/utils';

interface AccessTokenJWTPayload {
  userId: string;
  exp: number;
  iat: number;
}

declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    // Get both tokens from cookies, if production, use __Host- prefix
    const accessToken = env.NODE_ENV === 'production'
      ? getCookie(c, ACCESS_TOKEN_COOKIE_NAME_PROD)
      : getCookie(c, ACCESS_TOKEN_COOKIE_NAME_DEV);
    const refreshToken = env.NODE_ENV === 'production'
      ? getCookie(c, REFRESH_TOKEN_COOKIE_NAME_PROD)
      : getCookie(c, REFRESH_TOKEN_COOKIE_NAME_DEV);

    // If refresh token is missing, the user is unauthorized and is not
    // allowed to access the resource
    if (!refreshToken) {
      return c.json(
        createApiResponse({
          error: {
            code: ApiErrorCode.NO_REFRESH_TOKEN,
            message: 'Session expired. Please log in again.',
          },
        }),
        401,
      );
    }

    // Get the JWT secret from the environment variables
    const jwtSecret = env.JWT_SECRET;
    if (!jwtSecret) {
      return c.json(
        createApiResponse({
          error: {
            code: ApiErrorCode.INTERNAL_SERVER_ERROR,
            message: 'JWT secret not found',
          },
        }),
        500,
      );
    }

    // User ID to be set in the request context. This will be used to identify
    // the user in the database. It's initialized as an empty string for now
    // and will be set after getting a valid access token.
    let userId: string;

    // Handle missing access token by generating a new one from refresh token
    if (!accessToken) {
      try {
        // Generate new access token using refresh token
        const newAccessToken = await refreshAccessToken(refreshToken);

        // Set the new access token cookie
        if (env.NODE_ENV === 'production') {
          setCookie(c, ACCESS_TOKEN_COOKIE_NAME_PROD, newAccessToken, {
            httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
            secure: true, // Ensures the cookie is only sent over HTTPS
            sameSite: 'None', // Allow cross-site cookie sending in production since both apps are on different domains
            path: '/', // The cookie is only sent to requests to the root domain
            maxAge: 15 * 60, // 15 minutes in seconds
          });
        } else {
          setCookie(c, ACCESS_TOKEN_COOKIE_NAME_DEV, newAccessToken, {
            httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
            secure: false, // The cookie is only sent over HTTPS in production
            sameSite: 'Lax', // Prevents the cookie from being sent along with requests to other sites
            path: '/', // The cookie is only sent to requests to the root domain
            maxAge: 15 * 60, // 15 minutes in seconds
          });
        }

        // Decode the new access token to get user ID
        const decodedAccessToken = await verify(newAccessToken, jwtSecret);
        const accessTokenPayload
        = decodedAccessToken as unknown as AccessTokenJWTPayload;
        userId = accessTokenPayload.userId;
      } catch (error) {
        console.error('Failed to refresh access token:', error);

        // Determine the specific error type based on error message
        let errorCode = ApiErrorCode.INVALID_REFRESH_TOKEN;
        if (error instanceof Error) {
          if (error.message.includes('expired')) {
            errorCode = ApiErrorCode.REFRESH_TOKEN_EXPIRED;
          }
        }

        return c.json(
          createApiResponse({
            error: {
              code: errorCode,
              message: 'Session expired. Please log in again.',
            },
          }),
          401,
        );
      }
    } else {
      // In the case where an access token is present, we need to verify it
      // for authentication purposes by decoding the JWT and checking if the
      // user id is present in the payload and if the token is not expired.
      // This allows us to check if the passed access token is valid and if
      // not, try to refresh it.
      // If all checks pass, the user id will be set in the request context.
      // If any of the checks fail, the user will be unauthorized and the
      // middleware will return a 401 Unauthorized status, which will be
      // handled by the client to log the user out or whatever else is
      // appropriate client-side.
      try {
        const decodedAccessToken = await verify(accessToken, jwtSecret);
        const accessTokenPayload
        = decodedAccessToken as unknown as AccessTokenJWTPayload;

        // Check if the user id is present in the payload
        if (!accessTokenPayload.userId) {
          return c.json(
            createApiResponse({
              error: {
                code: ApiErrorCode.INVALID_ACCESS_TOKEN,
                message: 'Invalid access token',
              },
            }),
            401,
          );
        }

        // Check if the token is expired
        if (accessTokenPayload.exp < Date.now() / 1000) {
          // Try to refresh the token
          try {
            // Generate new access token using the refresh token from the
            // cookie
            const newAccessToken = await refreshAccessToken(refreshToken);

            // Set the new access token cookie
            if (env.NODE_ENV === 'production') {
              setCookie(c, ACCESS_TOKEN_COOKIE_NAME_PROD, newAccessToken, {
                httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
                secure: true, // Ensures the cookie is only sent over HTTPS
                sameSite: 'None', // Allow cross-site cookie sending in production since both apps are on different domains
                path: '/', // The cookie is only sent to requests to the root domain
                maxAge: 15 * 60, // 15 minutes in seconds
              });
            } else {
              setCookie(c, ACCESS_TOKEN_COOKIE_NAME_DEV, newAccessToken, {
                httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
                secure: false, // The cookie is only sent over HTTPS in production
                sameSite: 'Lax', // Prevents the cookie from being sent along with requests to other sites
                path: '/', // The cookie is only sent to requests to the root domain
                maxAge: 15 * 60, // 15 minutes in seconds
              });
            }

            // Use the user ID from the payload
            userId = accessTokenPayload.userId;
          } catch (error) {
            console.error('Failed to refresh access token:', error);

            // Determine the specific error type based on error message
            let errorCode = ApiErrorCode.INVALID_REFRESH_TOKEN;
            if (error instanceof Error) {
              if (error.message.includes('expired')) {
                errorCode = ApiErrorCode.REFRESH_TOKEN_EXPIRED;
              }
            }

            return c.json(
              createApiResponse({
                error: {
                  code: errorCode,
                  message: 'Session expired. Please log in again.',
                },
              }),
              401,
            );
          }
        } else {
          // Token is valid and not expired. Use the user ID from the passed
          // access token directly since it passed all checks.
          userId = accessTokenPayload.userId;
        }
      } catch {
        // Access token is invalid because it failed one of the checks. Try
        // to refresh the token.
        try {
          // Generate new access token using refresh token
          const newAccessToken = await refreshAccessToken(refreshToken);

          // Set the new access token cookie
          if (env.NODE_ENV === 'production') {
            setCookie(c, ACCESS_TOKEN_COOKIE_NAME_PROD, newAccessToken, {
              httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
              secure: true, // Ensures the cookie is only sent over HTTPS
              sameSite: 'None', // Allow cross-site cookie sending in production since both apps are on different domains
              path: '/', // The cookie is only sent to requests to the root domain
              maxAge: 15 * 60, // 15 minutes in seconds
            });
          } else {
            setCookie(c, ACCESS_TOKEN_COOKIE_NAME_DEV, newAccessToken, {
              httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
              secure: false, // The cookie is only sent over HTTPS in production
              sameSite: 'Lax', // Prevents the cookie from being sent along with requests to other sites
              path: '/', // The cookie is only sent to requests to the root domain
              maxAge: 15 * 60, // 15 minutes in seconds
            });
          }

          // Decode the new access token to get user ID
          const decodedAccessToken = await verify(newAccessToken, jwtSecret);
          const accessTokenPayload
          = decodedAccessToken as unknown as AccessTokenJWTPayload;

          // Use the user ID from the payload
          userId = accessTokenPayload.userId;
        } catch (error) {
          // If all attempts to refresh the token fail, return a 401
          // Unauthorized status. This will be handled by the client to log
          // the user out or whatever else is appropriate client-side.
          console.error('Failed to refresh access token:', error);

          // Determine the specific error type based on error message
          let errorCode = ApiErrorCode.INVALID_REFRESH_TOKEN;
          if (error instanceof Error) {
            if (error.message.includes('expired')) {
              errorCode = ApiErrorCode.REFRESH_TOKEN_EXPIRED;
            }
          }

          return c.json(
            createApiResponse({
              error: {
                code: errorCode,
                message: 'Session expired. Please log in again.',
              },
            }),
            401,
          );
        }
      }
    }

    // Get the database connection
    const db = c.get('db');

    // Set the current user id and is_service_request session variables
    // for the duration of the request. This is used to secure the database
    // connection against RLS for service requests.
    try {
      // Execute set_config calls separately to allow proper parameter binding
      await db.execute(
        sql`SELECT set_config('app.current_user_id', ${userId}::text, FALSE)`,
      );
      await db.execute(
        sql`SELECT set_config('app.is_service_request', 'false', FALSE)`,
      );
    } catch (dbError) {
      console.error(
        `[AuthMiddleware] Error setting DB config for userId: ${userId}`,
        dbError,
      );
      // Re-throw or handle as appropriate, maybe return 500?
      // For now, let's return a generic unauthorized to match existing behavior but log the real cause
      return c.json(
        createApiResponse({
          error: {
            code: ApiErrorCode.INTERNAL_SERVER_ERROR, // Or a more specific code if possible
            message: 'Database configuration error',
          },
        }),
        500,
      );
    }

    // Check if the user exists and is active by querying the database
    // with the user ID set in the previous steps.
    const user = await db.query.authUsersTable.findFirst({
      where: eq(authUsersTable.id, userId),
    });

    if (!user) {
      return c.json(
        createApiResponse({
          error: {
            code: ApiErrorCode.USER_NOT_FOUND,
            message: 'User not found',
          },
        }),
        401,
      );
    }

    if (!user.isActive) {
      return c.json(
        createApiResponse({
          error: {
            code: ApiErrorCode.USER_INACTIVE,
            message: 'User is inactive',
          },
        }),
        401,
      );
    }

    // Add the user id to the request context
    c.set('userId', user.id);

    // Check if user's tokens were invalidated
    if (user.lastTokenInvalidation) {
      // For this check, we need to use the original token's iat if available
      let tokenIssuedAt: number;

      if (accessToken) {
        try {
          const decodedAccessToken = await verify(accessToken, jwtSecret);
          const accessTokenPayload
          = decodedAccessToken as unknown as AccessTokenJWTPayload;
          tokenIssuedAt = accessTokenPayload.iat;
        } catch {
          // If we can't decode the access token, we'll use the current time
          tokenIssuedAt = Math.floor(Date.now() / 1000);
        }
      } else {
        // If there's no access token, use current time
        tokenIssuedAt = Math.floor(Date.now() / 1000);
      }

      const invalidationTime = Math.floor(
        user.lastTokenInvalidation.getTime() / 1000,
      );

      if (tokenIssuedAt < invalidationTime) {
        return c.json(
          createApiResponse({
            error: {
              code: ApiErrorCode.ACCESS_TOKEN_INVALIDATED,
              message: 'Access token invalidated',
            },
          }),
          401,
        );
      }
    }

    // Update the user's last activity time
    try {
      // Use db.execute with raw SQL to bypass potential prepared statement issues with RLS
      await db.execute(sql`
        UPDATE ${profilesTable}
        SET last_activity_at = ${new Date()}
        WHERE ${profilesTable.userId} = ${user.id}
      `);
    } catch (updateError) {
      console.error(
        `[AuthMiddleware] Error updating last activity for userId: ${userId}`,
        updateError,
      );
      // Depending on policy, you might want to let the request proceed or return an error
      // For now, let's log and continue.
    }

    // Call the next middleware
    await next();
  } catch (error) {
    console.error('[AuthMiddleware] Error caught in main try-catch:', error);
    return c.json(
      createApiResponse({
        error: {
          code: ApiErrorCode.UNAUTHORIZED,
          message: 'Unauthorized',
        },
      }),
      401,
    );
  }
};
