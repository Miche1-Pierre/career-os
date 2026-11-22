import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <p className="text-5xl font-semibold tracking-tight text-muted-foreground">404</p>
      <h1 className="heading-xl text-foreground">Introuvable</h1>
      <p className="text-sm text-muted-foreground">Cet élément n’existe pas ou a été supprimé définitivement.</p>
      <Button asChild>
        <Link href="/today">Retour à Aujourd’hui</Link>
      </Button>
    </div>
  );
}
