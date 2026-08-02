import { SignInForm } from "@/components/auth/sign-in-form";
import { PageHeader } from "@/components/ui/page-header";

export default function AuthPage() { return <section><PageHeader eyebrow="Welcome" title="Sign in to your clubhouse" description="Use Google or a secure email link to access the shared scoreboard." /><SignInForm /></section>; }
