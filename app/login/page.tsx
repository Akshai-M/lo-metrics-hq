import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { LoginForm } from "@/components/auth-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in · LO Metrics HQ" };

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Layers className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold">
              LO Metrics HQ<span className="text-primary">.</span>
            </div>
            <div className="eyebrow">ACD LO</div>
          </div>
        </div>
        <Card className="rounded-lg">
          <CardHeader>
            <div className="eyebrow">Internal report</div>
            <CardTitle className="font-serif text-2xl font-normal">Sign in</CardTitle>
            <CardDescription>Use the account your admin gave you.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
