import { IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  /** Accepts either a Company ID (e.g. YNX-0001) or work email address. */
  @IsString()
  @Length(2, 254)
  email!: string;

  @IsString()
  @Length(8, 200)
  password!: string;
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
