import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

const log = createLogger("api/session/recording-artifact");

const RequestSchema = z.object({
  sessionId: z.string().min(1),
  upload: z.object({
    url: z.string().min(1),
    path: z.string().min(1),
    bucket: z.string().min(1),
  }),
  metadata: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("screenshot"),
      timestamp: z.string(),
      screenshotType: z.enum(["camera", "screen"]),
    }),
    z.object({
      kind: z.literal("artifact"),
      timestamp: z.string(),
      artifactType: z.enum(["audio", "camera_video", "screen_video"]),
      mimeType: z.string().optional(),
      audioDuration: z.number().optional(),
    }),
  ]),
});

function appendUniqueByPath<T extends { path: string }>(items: T[], next: T): T[] {
  const withoutExisting = items.filter((item) => item.path !== next.path);
  return [...withoutExisting, next];
}

export async function POST(req: Request) {
  try {
    const input = RequestSchema.parse(await req.json());

    const { data: session, error: readError } = await supabaseAdmin
      .from("sessions")
      .select("screenshots, recordingArtifacts")
      .eq("id", input.sessionId)
      .single();

    if (readError) {
      log.error("Session read failed:", readError);
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }

    const updateData: Record<string, unknown> = {};

    if (input.metadata.kind === "screenshot") {
      const screenshot = {
        url: input.upload.url,
        path: input.upload.path,
        timestamp: input.metadata.timestamp,
        type: input.metadata.screenshotType,
      };
      updateData.screenshots = appendUniqueByPath(
        Array.isArray(session?.screenshots) ? session.screenshots : [],
        screenshot,
      );
    } else {
      const artifact = {
        url: input.upload.url,
        path: input.upload.path,
        timestamp: input.metadata.timestamp,
        type: input.metadata.artifactType,
        mimeType: input.metadata.mimeType,
      };
      updateData.recordingArtifacts = appendUniqueByPath(
        Array.isArray(session?.recordingArtifacts) ? session.recordingArtifacts : [],
        artifact,
      );

      if (input.metadata.artifactType === "audio") {
        updateData.audioRecordingUrl = input.upload.url;
        if (input.metadata.audioDuration !== undefined) {
          updateData.audioDuration = input.metadata.audioDuration;
        }
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("sessions")
      .update(updateData)
      .eq("id", input.sessionId);

    if (updateError) {
      log.error("Session update failed:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    log.error("Unexpected error:", err);
    return NextResponse.json({ error: "Failed to save recording artifact" }, { status: 500 });
  }
}
