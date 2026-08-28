import { useConvexAuth } from "convex/react";
import {
  ArrowRight,
  Plug,
  Server,
  Lock,
  GitCompare,
  ClipboardList,
  Bell,
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  // Redirect authenticated users straight to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-2xl mx-auto text-center space-y-8">
        <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-orange-600 mb-2">
          <Server className="size-8 text-white" />
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Staging Manager
        </h1>

        <p className="text-muted-foreground max-w-lg mx-auto text-base">
          Your complete dashboard for managing Rocket.net staging environments.
          Track plugins, compare content, manage HTTP auth, monitor Asana tasks,
          and keep staging sites in sync — all in one place.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <div className="rounded-lg border p-3.5 text-center space-y-1.5 hover:bg-muted/50 transition-colors">
            <Server className="size-5 mx-auto text-orange-500" />
            <p className="text-xs font-medium">Multi-Account</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Connect multiple Rocket.net accounts</p>
          </div>
          <div className="rounded-lg border p-3.5 text-center space-y-1.5 hover:bg-muted/50 transition-colors">
            <Plug className="size-5 mx-auto text-purple-500" />
            <p className="text-xs font-medium">Plugin Management</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Scan, activate & deactivate plugins</p>
          </div>
          <div className="rounded-lg border p-3.5 text-center space-y-1.5 hover:bg-muted/50 transition-colors">
            <Lock className="size-5 mx-auto text-emerald-500" />
            <p className="text-xs font-medium">HTTP Auth</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Password-protect staging sites</p>
          </div>
          <div className="rounded-lg border p-3.5 text-center space-y-1.5 hover:bg-muted/50 transition-colors">
            <GitCompare className="size-5 mx-auto text-blue-500" />
            <p className="text-xs font-medium">Content Diff</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Compare prod vs staging content</p>
          </div>
          <div className="rounded-lg border p-3.5 text-center space-y-1.5 hover:bg-muted/50 transition-colors">
            <ClipboardList className="size-5 mx-auto text-amber-500" />
            <p className="text-xs font-medium">Asana Integration</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Track STAGE tasks per site</p>
          </div>
          <div className="rounded-lg border p-3.5 text-center space-y-1.5 hover:bg-muted/50 transition-colors">
            <Bell className="size-5 mx-auto text-red-500" />
            <p className="text-xs font-medium">Sync Alerts</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Daily Slack notifications</p>
          </div>
        </div>

        {!isLoading && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button size="lg" className="text-base h-11 px-6 bg-orange-600 hover:bg-orange-700" asChild>
              <Link to="/signup">
                Get Started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base h-11 px-6" asChild>
              <Link to="/login">Sign In</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
