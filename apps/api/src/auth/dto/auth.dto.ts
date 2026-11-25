import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  /** Accepts either a Company ID (e.g. YNX-0001) or work email address. */
  @IsString()
  @Length(2, 254)
  email!: string;

  @IsString()
  @Length(8, 200)
  password!: string;

  /** Optional 6-digit TOTP or 8-char backup code when 2FA is enabled on the account. */
  @IsOptional()
  @IsString()
  @Length(6, 32)
  totpCode?: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, 200)
  currentPassword!: string;

  @IsString()
  @Length(12, 200)
  newPassword!: string;
}

export class ForgotPasswordDto {
  /** Accepts either a Company ID (e.g. YNX-0001) or work email address. */
  @IsString()
  @Length(2, 254)
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @Length(12, 200)
  newPassword!: string;
}

export class TwoFactorVerifyDto {
  @IsString()
  @Length(6, 16)
  code!: string;
}

export class TwoFactorDisableDto {
  @IsString()
  @Length(8, 200)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(6, 16)
  code?: string;
}

export class VerifyPasswordDto {
  @IsString()
  @Length(8, 200)
  password!: string;
}
