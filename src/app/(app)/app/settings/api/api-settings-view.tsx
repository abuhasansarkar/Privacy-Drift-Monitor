"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  createWebhookAction,
  deleteWebhookAction,
} from "@/server/actions/api-settings";
import type { ApiKeySummary } from "@/server/services/api-keys";
import type { WebhookEndpointSummary } from "@/server/services/webhook-service";
import { toast } from "sonner";

interface Props {
  apiKeys: ApiKeySummary[];
  webhooks: WebhookEndpointSummary[];
}

export function ApiSettingsView({ apiKeys, webhooks }: Props) {
  const [isPending, startTransition] = useTransition();

  // Create Key Modal & Newly Generated Key State
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["read", "write"]);
  const [createdKey, setCreatedKey] = useState<{ name: string; rawKey: string } | null>(null);

  // Create Webhook Modal
  const [isCreateWebhookOpen, setIsCreateWebhookOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookDescription, setWebhookDescription] = useState("");
  const [createdWebhook, setCreatedWebhook] = useState<{ url: string; secret: string } | null>(null);

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) {
      toast.error("Please enter a name for the API key");
      return;
    }

    startTransition(async () => {
      const res = await createApiKeyAction({
        name: newKeyName.trim(),
        scopes: keyScopes,
      });

      if (res.ok) {
        setCreatedKey({ name: res.data.name, rawKey: res.data.rawKey });
        setIsCreateKeyOpen(false);
        setNewKeyName("");
        toast.success("API key generated successfully");
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleRevokeKey = (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke the API key "${name}"? Existing integrations using it will immediately stop working.`)) {
      return;
    }

    startTransition(async () => {
      const res = await revokeApiKeyAction(id);
      if (res.ok) {
        toast.success("API key revoked");
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleCreateWebhook = () => {
    if (!webhookUrl.trim()) {
      toast.error("Please enter a webhook endpoint URL");
      return;
    }

    startTransition(async () => {
      const res = await createWebhookAction({
        url: webhookUrl.trim(),
        description: webhookDescription.trim() || undefined,
        events: ["website.scan.completed", "privacy_drift.detected"],
      });

      if (res.ok) {
        setCreatedWebhook({ url: res.data.url, secret: res.data.secret });
        setIsCreateWebhookOpen(false);
        setWebhookUrl("");
        setWebhookDescription("");
        toast.success("Webhook endpoint registered");
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleDeleteWebhook = (id: string, url: string) => {
    if (!confirm(`Are you sure you want to delete the webhook for "${url}"?`)) {
      return;
    }

    startTransition(async () => {
      const res = await deleteWebhookAction(id);
      if (res.ok) {
        toast.success("Webhook endpoint removed");
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      {/* 1. Newly Created Key Reveal Modal */}
      {createdKey && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">
                API Key Generated: {createdKey.name}
              </h3>
              <p className="text-small text-muted-foreground">
                Please copy your API key now. For security reasons,{" "}
                <span className="font-semibold text-foreground">
                  it will never be displayed again
                </span>
                .
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCreatedKey(null)}
            >
              Dismiss
            </Button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-background px-3 py-2 font-mono text-small text-foreground border">
              {createdKey.rawKey}
            </code>
            <Button
              variant="secondary"
              onClick={() => copyToClipboard(createdKey.rawKey, "API key")}
            >
              Copy Key
            </Button>
          </div>
        </div>
      )}

      {/* 2. Newly Created Webhook Secret Reveal Banner */}
      {createdWebhook && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">
                Webhook Registered: {createdWebhook.url}
              </h3>
              <p className="text-small text-muted-foreground">
                Save your HMAC signing secret to verify incoming webhook signatures (
                <code className="font-mono text-xs">x-pdm-signature</code>).
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCreatedWebhook(null)}
            >
              Dismiss
            </Button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-background px-3 py-2 font-mono text-small text-foreground border">
              {createdWebhook.secret}
            </code>
            <Button
              variant="secondary"
              onClick={() => copyToClipboard(createdWebhook.secret, "Signing secret")}
            >
              Copy Secret
            </Button>
          </div>
        </div>
      )}

      {/* 3. API Keys Section */}
      <Card>
        <CardHeader
          title="Public REST API Keys"
          action={
            <Button onClick={() => setIsCreateKeyOpen(true)}>
              Generate API Key
            </Button>
          }
        />
        <div className="p-4">
          <p className="mb-4 text-small text-muted-foreground">
            Authenticate programmatic requests to the Privacy Drift Monitor Public REST API v1.
            Include the key in the HTTP request header:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              Authorization: Bearer pdm_live_...
            </code>
          </p>

          {apiKeys.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
              <p className="font-medium">No API keys yet</p>
              <p className="mt-1 text-small">
                Generate an API key to integrate external CI/CD pipelines, agency portals, or scripts.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key Prefix</TableHead>
                    <TableHead>Scopes</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>
                        <code className="font-mono text-xs text-muted-foreground">
                          {key.keyPrefix}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {key.scopes.map((s) => (
                            <Badge key={s} variant="outline">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-small text-muted-foreground">
                        {new Date(key.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-small text-muted-foreground">
                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleRevokeKey(key.id, key.name)}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Card>

      {/* 4. Outbound Webhooks Section */}
      <Card>
        <CardHeader
          title="Outbound Webhooks"
          action={
            <Button onClick={() => setIsCreateWebhookOpen(true)}>
              Add Webhook Endpoint
            </Button>
          }
        />
        <div className="p-4">
          <p className="mb-4 text-small text-muted-foreground">
            Receive real-time notifications for scan events and detected drift.
            Every payload is signed with HMAC-SHA256 in the{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              x-pdm-signature
            </code>{" "}
            header.
          </p>

          {webhooks.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
              <p className="font-medium">No webhook endpoints registered</p>
              <p className="mt-1 text-small">
                Add an HTTPS endpoint to automatically receive alerts in your custom backend.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint URL</TableHead>
                    <TableHead>Subscribed Events</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Secret</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhooks.map((wh) => (
                    <TableRow key={wh.id}>
                      <TableCell className="font-medium">
                        <div>
                          <p className="font-mono text-small">{wh.url}</p>
                          {wh.description && (
                            <p className="text-xs text-muted-foreground">{wh.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {wh.events.map((ev) => (
                            <Badge key={ev} variant="secondary" className="font-mono text-xs">
                              {ev}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={wh.isActive ? "default" : "secondary"}>
                          {wh.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="font-mono text-xs"
                          onClick={() => copyToClipboard(wh.secret, "Signing secret")}
                        >
                          Copy Secret
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleDeleteWebhook(wh.id, wh.url)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Card>

      {/* 5. REST API Documentation & Code Snippet Reference */}
      <Card>
        <CardHeader title="Public REST API v1 Quick Reference" />
        <div className="space-y-4 p-4 text-small">
          <div className="rounded-md bg-muted/60 p-3">
            <p className="font-semibold text-foreground">1. List Monitored Websites</p>
            <code className="mt-1 block overflow-x-auto font-mono text-xs text-foreground">
              curl -H &quot;Authorization: Bearer pdm_live_...&quot; https://your-domain.com/api/v1/websites
            </code>
          </div>

          <div className="rounded-md bg-muted/60 p-3">
            <p className="font-semibold text-foreground">2. Trigger On-Demand Scan</p>
            <code className="mt-1 block overflow-x-auto font-mono text-xs text-foreground">
              curl -X POST -H &quot;Authorization: Bearer pdm_live_...&quot; https://your-domain.com/api/v1/websites/SITE_ID/scans
            </code>
          </div>

          <div className="rounded-md bg-muted/60 p-3">
            <p className="font-semibold text-foreground">3. Fetch Scan Results &amp; Findings</p>
            <code className="mt-1 block overflow-x-auto font-mono text-xs text-foreground">
              curl -H &quot;Authorization: Bearer pdm_live_...&quot; https://your-domain.com/api/v1/scans/SCAN_ID
            </code>
          </div>

          <div className="rounded-md bg-muted/60 p-3">
            <p className="font-semibold text-foreground">4. Download Audit Report</p>
            <code className="mt-1 block overflow-x-auto font-mono text-xs text-foreground">
              curl -H &quot;Authorization: Bearer pdm_live_...&quot; https://your-domain.com/api/v1/reports/REPORT_ID/download?json=true
            </code>
          </div>
        </div>
      </Card>

      {/* Create Key Dialog */}
      <Dialog open={isCreateKeyOpen} onOpenChange={setIsCreateKeyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate New API Key</DialogTitle>
            <DialogDescription>
              Create a secret credential to access the Public REST API.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-small font-medium text-foreground">Key Name</label>
              <Input
                placeholder="e.g. CI/CD GitHub Action, Internal Dashboard"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-small font-medium text-foreground">Permissions</label>
              <div className="mt-2 flex gap-4">
                <label className="flex items-center gap-2 text-small">
                  <input
                    type="checkbox"
                    checked={keyScopes.includes("read")}
                    onChange={(e) => {
                      if (e.target.checked) setKeyScopes([...keyScopes, "read"]);
                      else setKeyScopes(keyScopes.filter((s) => s !== "read"));
                    }}
                  />
                  <span>Read (View websites, scans, reports)</span>
                </label>
                <label className="flex items-center gap-2 text-small">
                  <input
                    type="checkbox"
                    checked={keyScopes.includes("write")}
                    onChange={(e) => {
                      if (e.target.checked) setKeyScopes([...keyScopes, "write"]);
                      else setKeyScopes(keyScopes.filter((s) => s !== "write"));
                    }}
                  />
                  <span>Write (Create websites, trigger scans)</span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsCreateKeyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateKey} disabled={isPending || !newKeyName.trim()}>
              Generate Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Webhook Dialog */}
      <Dialog open={isCreateWebhookOpen} onOpenChange={setIsCreateWebhookOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Outbound Webhook</DialogTitle>
            <DialogDescription>
              Register an HTTPS endpoint to receive event notifications.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-small font-medium text-foreground">Endpoint URL</label>
              <Input
                placeholder="https://example.com/api/webhooks/pdm"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-small font-medium text-foreground">Description (Optional)</label>
              <Input
                placeholder="e.g. Slack bridge, Customer CRM notification"
                value={webhookDescription}
                onChange={(e) => setWebhookDescription(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsCreateWebhookOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateWebhook} disabled={isPending || !webhookUrl.trim()}>
              Save Endpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
