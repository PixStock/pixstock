import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Matches } from 'class-validator';

/** 64 bytes, base64. */
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;

export class SubmitSignatureDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @Matches(SIGNATURE, { each: true, message: 'each signature must be 64 base64-encoded bytes' })
  signatures!: string[];
}
