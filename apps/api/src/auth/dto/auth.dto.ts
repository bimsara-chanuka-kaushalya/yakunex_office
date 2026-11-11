import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
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
  @IsEmail()
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
