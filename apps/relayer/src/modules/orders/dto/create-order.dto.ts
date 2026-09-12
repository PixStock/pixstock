import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const AMOUNT = /^[1-9]\d{0,19}$/;

export class OrderLegDto {
  @IsString()
  @Matches(BASE58, { message: 'inMint must be a base58 mint address' })
  inMint!: string;

  @IsString()
  @Matches(BASE58, { message: 'outMint must be a base58 mint address' })
  outMint!: string;

  @IsString()
  @Matches(AMOUNT, { message: 'inAmount must be a positive whole number' })
  inAmount!: string;
}

export class CreateOrderDto {
  @IsString()
  @Matches(BASE58, { message: 'vault must be a base58 public key' })
  vault!: string;

  /**
   * Four is where a basket stops fitting comfortably in one transaction —
   * measured at 1052 bytes against a 1232 limit, before a route gets longer.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => OrderLegDto)
  legs!: OrderLegDto[];

  /** Capped at the same 300 bps the vault refuses to exceed. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  slippageBps: number = 100;
}
