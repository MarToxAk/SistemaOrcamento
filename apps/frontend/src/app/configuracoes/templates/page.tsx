import type { Metadata } from "next";

import TemplatesManager from "./templates-manager";

export const metadata: Metadata = {
  title: "Gerenciar Templates de PDF",
};

export default function TemplatesPage() {
  return <TemplatesManager />;
}
