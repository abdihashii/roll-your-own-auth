import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSchema } from '@roll-your-own-auth/shared/schemas';
import { createFileRoute, Link, useSearch } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { verifyForgotPasswordToken } from '@/api/auth-apis';
import { PasswordInput } from '@/components/auth/auth-form';
import { AuthGuard } from '@/components/auth/auth-guard';
import {
  PasswordRequirementsChecker,
} from '@/components/auth/password-requirements-checker';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

const resetPasswordTokenSchema = z.object({
  token: z.string().min(1).optional(),
});

export const Route = createFileRoute('/reset-password/')({
  component: ResetPassword,
  validateSearch: zodValidator(resetPasswordTokenSchema),
});

const resetPasswordPasswordSchema = z.object({
  new_password: passwordSchema,
  confirm_new_password: passwordSchema,
}).refine((data) => data.new_password === data.confirm_new_password, {
  path: ['confirm_new_password'],
  message: 'Passwords do not match',
});

function ResetPassword() {
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);

  const { token } = useSearch({ from: '/reset-password/' });
  const {
    register,
    handleSubmit,
    formState: {
      isSubmitting,
      errors,
    },
    watch,
  } = useForm<z.infer<typeof resetPasswordPasswordSchema>>({
    resolver: zodResolver(resetPasswordPasswordSchema),
    defaultValues: {
      new_password: '',
      confirm_new_password: '',
    },
  });

  const newPassword = watch('new_password');
  const confirmNewPassword = watch('confirm_new_password');

  const passwordCheckerId = useId();

  const onSubmitPassword = async (
    data: z.infer<typeof resetPasswordPasswordSchema>,
  ) => {
    if (!token || !data.new_password || !data.confirm_new_password) {
      return;
    }

    const {
      success,
      message,
      error,
    } = await verifyForgotPasswordToken(token, data.new_password);

    if (!success) {
      toast.error(error?.message ?? 'An error occurred');
    } else {
      toast.success(message ?? 'Password reset successfully');
      setPasswordResetSuccess(true);
    }
  };

  return (
    <AuthGuard requireAuth={false}>
      <main
        className="flex min-h-svh w-full items-center justify-center p-6 md:p-10"
      >
        <div className="w-full max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Reset Password</CardTitle>
              <CardDescription>
                Enter your new password below
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!passwordResetSuccess
                ? (
                    <form
                      onSubmit={handleSubmit(onSubmitPassword)}
                      className="grid gap-6"
                    >
                      <PasswordInput
                        id="new_password"
                        label="New Password"
                        register={register('new_password')}
                        error={errors.new_password?.message}
                        aria-describedby={cn(
                          errors.new_password
                            ? passwordCheckerId
                            : undefined,
                          newPassword && passwordCheckerId,
                        ).trim() || undefined}
                      />

                      <PasswordRequirementsChecker
                        password={newPassword}
                        id={passwordCheckerId}
                      />

                      <PasswordInput
                        id="confirm_new_password"
                        label="Confirm New Password"
                        register={register('confirm_new_password')}
                        error={errors.confirm_new_password?.message}
                        aria-describedby={cn(
                          errors.confirm_new_password
                            ? passwordCheckerId
                            : undefined,
                          confirmNewPassword && passwordCheckerId,
                        ).trim() || undefined}
                      />

                      <Button
                        type="submit"
                        className="w-full hover:cursor-pointer"
                        disabled={isSubmitting}
                      >
                        {isSubmitting
                          ? (
                              <>
                                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                                Resetting password...
                              </>
                            )
                          : (
                              'Reset Password'
                            )}
                      </Button>
                    </form>
                  )
                : (
                    <div className="space-y-2">
                      <p className="text-lg font-medium">Password Reset Successful!</p>
                      <p className="text-muted-foreground">
                        Your password has been updated. You can now log in with your
                        new password.
                      </p>
                    </div>
                  )}

              <Button
                type="button"
                variant="secondary"
                className="w-full hover:cursor-pointer mt-6"
                asChild
              >
                <Link to="/login">Back to login</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </AuthGuard>
  );
}
