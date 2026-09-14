import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { SiteScript } from "@/components/SiteScript";
import { content } from "@/content/site";
import { OrderSigner } from "./OrderSigner";

export const metadata: Metadata = {
  title: "Send to vault",
  description: "Show this order to an offline vault.",
  robots: { index: false, follow: false },
};

export default async function SignOrderPage({ params }: PageProps<"/sign/[orderId]">) {
  const { orderId } = await params;
  const dict = content;

  return (
    <>
      <SiteScript a11y={dict.common} />

      {/* The shell lives inside OrderSigner on this route alone: the session
          id in the status strip is minted there, and the rail steps forward
          once the signature comes back. */}
      <OrderSigner orderId={orderId} />

      <Footer dict={dict} />
    </>
  );
}
