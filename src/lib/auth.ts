import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const hasGoogle =
  Boolean(process.env.AUTH_GOOGLE_ID) &&
  Boolean(process.env.AUTH_GOOGLE_SECRET);

// Comma-separated allowlist of sign-in email domains, e.g.
// "princeton.edu,gmail.com". Empty/unset means no domain restriction.
const allowedEmailDomains =
  process.env.ALLOWED_EMAIL_DOMAINS?.split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean) ?? [];

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: Role;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: hasGoogle ? PrismaAdapter(prisma) : undefined,
  providers: [
    ...(hasGoogle
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
            // Pre-restrict the Google account picker only when exactly one
            // domain is allowed. `hd` takes a single domain, so for a multi-
            // domain allowlist (e.g. princeton.edu + gmail.com) we omit it and
            // let the signIn callback below enforce the full list instead.
            ...(allowedEmailDomains.length === 1
              ? { authorization: { params: { hd: allowedEmailDomains[0] } } }
              : {}),
          }),
        ]
      : [
          Credentials({
            name: "Dev Login",
            credentials: {
              email: { label: "Email", type: "email" },
              name: { label: "Name", type: "text" },
            },
            async authorize(credentials) {
              const email = credentials?.email as string | undefined;
              if (!email) return null;
              let user = await prisma.user.findUnique({
                where: { email: email.toLowerCase() },
              });
              if (!user) {
                const isTreasurer =
                  email.toLowerCase() ===
                  process.env.INITIAL_TREASURER_EMAIL?.toLowerCase();
                user = await prisma.user.create({
                  data: {
                    email: email.toLowerCase(),
                    name: (credentials?.name as string) || email.split("@")[0],
                    role: isTreasurer ? "TREASURER" : "OFFICER",
                  },
                });
              }
              return {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
              };
            },
          }),
        ]),
  ],
  session: hasGoogle ? { strategy: "database" } : { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;

      if (allowedEmailDomains.length) {
        const domain = email.split("@")[1];
        if (!domain || !allowedEmailDomains.includes(domain)) return false;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id! },
        });
        token.role = dbUser?.role ?? ("OFFICER" as Role);
      }
      return token;
    },
    async session({ session, token, user }) {
      if (!session.user) return session;

      if (user?.id) {
        const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
        session.user.id = user.id;
        session.user.role = dbUser?.role ?? "OFFICER";
      } else if (token?.sub) {
        const dbUser = await prisma.user.findUnique({ where: { id: token.sub } });
        session.user.id = token.sub;
        session.user.role =
          dbUser?.role ??
          ((token as { role?: Role }).role ?? "OFFICER");
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      const treasurerEmail = process.env.INITIAL_TREASURER_EMAIL?.toLowerCase();
      if (treasurerEmail && user.email?.toLowerCase() === treasurerEmail) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: "TREASURER" },
        });
      }
    },
  },
});

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireTreasurer() {
  const session = await requireSession();
  if (session.user.role !== "TREASURER") {
    throw new Error("Forbidden");
  }
  return session;
}
