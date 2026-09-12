-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('BUILT', 'AWAITING_SIGNATURE', 'SIGNED', 'BROADCAST', 'CONFIRMED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('BUY', 'SELL', 'BASKET');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "vault" TEXT NOT NULL,
    "kind" "OrderKind" NOT NULL,
    "manifest" JSONB NOT NULL,
    "txMessages" TEXT[],
    "messageHashes" TEXT[],
    "attestation" TEXT,
    "nonceAccount" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'BUILT',
    "vaultSigs" TEXT[],
    "txSignatures" TEXT[],
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonceAccount" (
    "pubkey" TEXT NOT NULL,
    "inUse" BOOLEAN NOT NULL DEFAULT false,
    "orderId" TEXT,
    "lastValue" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NonceAccount_pkey" PRIMARY KEY ("pubkey")
);

-- CreateTable
CREATE TABLE "RelayerEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "type" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelayerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_vault_createdAt_idx" ON "Order"("vault", "createdAt");
