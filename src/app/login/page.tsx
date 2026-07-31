import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const hasGoogle =
  Boolean(process.env.AUTH_GOOGLE_ID) &&
  Boolean(process.env.AUTH_GOOGLE_SECRET);

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-muted/40 p-6">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10 lg:min-h-[24rem] lg:grid-cols-2">
        {/* First in the DOM so it sits above the form on narrow screens;
            `order` moves it to the right column once the split kicks in. */}
        <div className="relative h-28 sm:h-36 lg:order-last lg:h-auto">
          <Image
            src="/capandgown.webp"
            alt="The Cap & Gown clubhouse at dusk"
            fill
            priority
            sizes="(min-width: 1024px) 384px, 100vw"
            // The short mobile band would otherwise crop to roofline; bias it
            // down to the lit pavilion. The tall desktop column needs no bias.
            className="object-cover object-[50%_72%] lg:object-center"
          />
        </div>

        <div className="flex flex-col justify-center gap-6 p-8 sm:p-10">
          <div>
            <Image
              src="/cap_logo.png"
              alt="Cap & Gown crest"
              width={1068}
              height={1374}
              priority
              className="mb-4 h-10 w-auto"
            />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cap &amp; Gown
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Budget &amp; Tracking</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to manage semester budgets, checks, and reimbursements.
            </p>
          </div>

          {hasGoogle ? (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
            >
              <Button type="submit" className="w-full">
                Continue with Google
              </Button>
            </form>
          ) : (
            <form
              action={async (formData) => {
                "use server";
                await signIn("credentials", {
                  email: formData.get("email") as string,
                  name: formData.get("name") as string,
                  redirectTo: "/",
                });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@gmail.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" type="text" placeholder="Your name" />
              </div>
              <Button type="submit" className="w-full">
                Dev sign in
              </Button>
              <p className="text-xs text-muted-foreground">
                Dev mode: configure Google OAuth in production.
              </p>
            </form>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Cap &amp; Gown Club &middot; Treasury
      </p>
    </div>
  );
}
