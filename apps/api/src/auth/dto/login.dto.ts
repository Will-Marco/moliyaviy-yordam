import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Login kiritilmagan' })
  @MaxLength(100)
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'Parol kiritilmagan' })
  @MaxLength(200)
  password: string;
}
