import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength, ValidateNested } from 'class-validator';

export const MAX_IMPORT_FILES = 50;
export const MAX_IMPORT_FILE_CHARS = 1_000_000;

export class ImportFileDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(MAX_IMPORT_FILE_CHARS, { message: 'Fayl hajmi 1 MB dan oshmasligi kerak' })
  content: string;
}

export class ImportCompaniesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida bitta fayl tanlang' })
  @ArrayMaxSize(MAX_IMPORT_FILES, { message: `Bir yo'la ${MAX_IMPORT_FILES} tadan ko'p fayl yuklab bo'lmaydi` })
  @ValidateNested({ each: true })
  @Type(() => ImportFileDto)
  files: ImportFileDto[];
}
