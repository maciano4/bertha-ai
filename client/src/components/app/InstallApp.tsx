// "Install app": uses the browser's install prompt when it offers one; otherwise explains how
// (iPhone/iPad: Share > Add to Home Screen). Hidden once Bertha runs as an installed app.
import { useState } from "react";
import { Download, Share, PlusSquare, MoreVertical } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInstallPrompt } from "@/lib/pwa";

export default function InstallApp() {
  const install = useInstallPrompt();
  const [help, setHelp] = useState(false);
  if (install.installed) return null;

  const onClick = async () => {
    if (install.canPrompt) await install.prompt();
    else setHelp(true);
  };

  return (
    <>
      <button type="button" onClick={onClick} className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm text-foreground/80 hover:bg-sidebar-accent hover:text-foreground" data-testid="button-install-app"
        data-install={install.canPrompt ? "prompt" : install.ios ? "ios" : "help"}>
        <Download className="h-4 w-4" /> Install app
      </button>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-sm" data-testid="install-help">
          <DialogHeader>
            <DialogTitle>Install Bertha</DialogTitle>
            <DialogDescription>Get Bertha on your home screen. It opens full screen like any other app.</DialogDescription>
          </DialogHeader>
          {install.ios ? (
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-3"><Share className="h-5 w-5 shrink-0 text-primary" /> In Safari, tap the <b>Share</b> button.</li>
              <li className="flex items-center gap-3"><PlusSquare className="h-5 w-5 shrink-0 text-primary" /> Choose <b>Add to Home Screen</b>.</li>
              <li className="flex items-center gap-3"><span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-primary">✓</span> Tap <b>Add</b>, then open Bertha from your home screen.</li>
            </ol>
          ) : (
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-3"><MoreVertical className="h-5 w-5 shrink-0 text-primary" /> Open your browser's menu (or the install icon in the address bar).</li>
              <li className="flex items-center gap-3"><Download className="h-5 w-5 shrink-0 text-primary" /> Choose <b>Install Bertha</b> or <b>Add to Home screen</b>.</li>
              <li className="text-xs text-muted-foreground">Works in Chrome, Edge and Samsung Internet, and in Safari on iPhone and iPad. Some browsers, like Firefox on a computer, can't install web apps.</li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
