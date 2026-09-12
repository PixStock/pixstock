import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export class GetQuoteDto {
  @IsString()
  @Matches(BASE58, { message: 'in must be a base58 mint address' })
  in!: string;

  @IsString()
  @Matches(BASE58, { message: 'out must be a base58 mint address' })
  out!: string;

  /** Raw amount, smallest unit. A string because it is a u64. */
  @IsString()
  @Matches(/^[1-9]\d{0,19}$/, { message: 'amount must be a positive whole number' })
  amount!: string;

  /**
   * Capped at the same 300 bps the vault enforces. Asking for more here only
   * produces an order the vault will refuse.
   */
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 100 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(300)
  slippageBps: number = 100;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyDirectRoutes: boolean = false;
}
