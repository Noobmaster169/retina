import Link from "next/link";

export default function EmailNotFound() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-2 px-6 text-center text-sm">
      <p className="font-medium">There is no message with that id.</p>
      <Link href="/" className="text-accent-ink hover:underline">
        Back to the inbox
      </Link>
    </main>
  );
}
