import { createFileRoute } from "@tanstack/react-router";
import { Pagina } from "@/components/pagina/Pagina";
import { paginaHead } from "@/components/pagina/head";

export const Route = createFileRoute("/")({
  head: paginaHead,
  component: Pagina,
});
