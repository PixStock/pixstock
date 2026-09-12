import type { Metadata } from "next";
import { Header } from "@/components/Header";
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
      <Header dict={dict} />

      <main id="main">
        <div className="head-spacer" id="head-spacer" />

        <section className="band page-head">
          <div className="shell">
            <p className="eyebrow">AGQP v1</p>
            <h1>Send to vault</h1>
            <p className="lede">
              Point the vault camera at this screen. The frames cycle, so it can
              join anywhere — there is nothing to time and nothing to click.
            </p>
          </div>
        </section>

        <section className="band band--tight">
          <div className="shell" style={{ maxWidth: 720 }}>
            <OrderSigner orderId={orderId} />
          </div>
        </section>
      </main>

      <Footer dict={dict} />
    </>
  );
}
