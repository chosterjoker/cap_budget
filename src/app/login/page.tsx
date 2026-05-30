import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const hasGoogle =
  Boolean(process.env.AUTH_GOOGLE_ID) &&
  Boolean(process.env.AUTH_GOOGLE_SECRET);

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Image
            src="/cap_logo.png"
            alt="Cap & Gown crest"
            width={1068}
            height={1374}
            priority
            className="mx-auto mb-2 h-16 w-auto"
          />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cap & Gown
          </p>
          <CardTitle className="text-2xl">Budget & Tracking</CardTitle>
          <CardDescription>
            Sign in to manage semester budgets, checks, and reimbursements.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <p className="text-center text-xs text-muted-foreground">
                Dev mode: configure Google OAuth in production.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
