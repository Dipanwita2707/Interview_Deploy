import {
  buildLocalSessionAssetUrl,
  isLocalSessionAssetUrl,
} from "@/lib/server/session-asset-storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOrgMembership, hasProjectAccess, protectedProcedure, router } from "../trpc";

interface ScreenshotEntry {
  url: string;
  path: string;
  timestamp: string;
  type: "camera" | "screen";
}

interface RecordingArtifactEntry {
  url: string;
  path: string;
  timestamp: string;
  type: "audio" | "camera_video" | "screen_video";
  mimeType?: string;
}

async function resolveSignedUrl(bucket: string, path: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24); // 24 hours
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function resolveAssetUrl(options: {
  bucket: string;
  path?: string | null;
  url?: string | null;
}): Promise<string | null> {
  if (isLocalSessionAssetUrl(options.url)) {
    return options.url ?? null;
  }

  if (options.path) {
    const signedUrl = await resolveSignedUrl(options.bucket, options.path);
    if (signedUrl) {
      return signedUrl;
    }
  }

  if (options.path && options.url?.startsWith("/")) {
    return buildLocalSessionAssetUrl(options.bucket, options.path);
  }

  return options.url ?? null;
}

export const analysisRouter = router({
  getSessionSummary: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select(
          `*, interview:interviews!inner(userId, title, objective, projectId, project:projects!inner(organizationId)), messages(*)`,
        )
        .eq("id", input.sessionId)
        .order("timestamp", { referencedTable: "messages", ascending: true })
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const interview = session.interview as {
        userId: string;
        title: string;
        objective: string | null;
        projectId: string;
        project: { organizationId: string };
      };

      const membership = await getOrgMembership(ctx.supabase, interview.project.organizationId, ctx.user.id);
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
      }

      const projAccess = await hasProjectAccess(ctx.supabase, interview.projectId, ctx.user.id);
      if (!projAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
      }

      let audioRecordingUrl: string | null = null;
      if (session.audioRecordingUrl) {
        const storedUrl = session.audioRecordingUrl as string;
        const pathMatch = storedUrl.match(/\/recordings\/(.+?)(?:\?|$)/);
        audioRecordingUrl = await resolveAssetUrl({
          bucket: "recordings",
          path: pathMatch?.[1] ?? null,
          url: storedUrl,
        });
      }

      let screenshots: ScreenshotEntry[] | null = null;
      const rawScreenshots = session.screenshots as ScreenshotEntry[] | null;
      if (rawScreenshots && rawScreenshots.length > 0) {
        screenshots = await Promise.all(
          rawScreenshots.map(async (s) => {
            const resolvedUrl = await resolveAssetUrl({
              bucket: "screenshots",
              path: s.path,
              url: s.url,
            });
            return { ...s, url: resolvedUrl || s.url };
          }),
        );
      }

      let recordingArtifacts: RecordingArtifactEntry[] | null = null;
      const rawArtifacts = (session as Record<string, unknown>).recordingArtifacts as RecordingArtifactEntry[] | null;
      if (rawArtifacts && rawArtifacts.length > 0) {
        recordingArtifacts = await Promise.all(
          rawArtifacts.map(async (a) => {
            const resolvedUrl = await resolveAssetUrl({
              bucket: "recordings",
              path: a.path,
              url: a.url,
            });
            return { ...a, url: resolvedUrl || a.url };
          }),
        );
      }

      return {
        interviewTitle: interview.title,
        interviewObjective: interview.objective,
        participantName: session.participantName,
        participantEmail: session.participantEmail,
        participantPhone: session.participantPhone,
        participantMetadata: session.participantMetadata,
        status: session.status,
        createdAt: session.createdAt,
        summary: session.summary,
        insights: session.insights,
        themes: session.themes,
        sentiment: session.sentiment,
        messages: session.messages,
        totalDurationSeconds: session.totalDurationSeconds,
        audioRecordingUrl,
        audioDuration: (session as Record<string, unknown>).audioDuration as number | null,
        screenshots,
        recordingArtifacts,
        antiCheatingLog: (session as Record<string, unknown>).antiCheatingLog as
          | { type: string; timestamp: number; detail?: string }[]
          | null,
      };
    }),

  getInterviewInsights: protectedProcedure
    .input(z.object({ interviewId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: interview } = await ctx.supabase
        .from("interviews")
        .select("id, projectId, project:projects!inner(organizationId)")
        .eq("id", input.interviewId)
        .single();

      if (!interview) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const project = interview.project as unknown as { organizationId: string };
      const membership = await getOrgMembership(ctx.supabase, project.organizationId, ctx.user.id);
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
      }

      const projAccess = await hasProjectAccess(ctx.supabase, interview.projectId, ctx.user.id);
      if (!projAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
      }

      const { data: sessions } = await ctx.supabase
        .from("sessions")
        .select("participantEmail, totalDurationSeconds, themes, messages(id)")
        .eq("interviewId", input.interviewId)
        .eq("status", "COMPLETED");

      const completedSessions = sessions ?? [];
      const totalSessions = completedSessions.length;
      const avgDuration =
        totalSessions > 0
          ? completedSessions.reduce(
              (sum, s) => sum + (s.totalDurationSeconds ?? 0),
              0,
            ) / totalSessions
          : 0;

      const totalMessages = completedSessions.reduce(
        (sum, s) => sum + ((s.messages as { id: string }[])?.length ?? 0),
        0,
      );

      const uniqueEmails = new Set(
        completedSessions
          .map((s) => s.participantEmail)
          .filter((e): e is string => !!e),
      );

      const allThemes = completedSessions.flatMap((s) => s.themes ?? []);
      const themeCounts: Record<string, number> = {};
      for (const theme of allThemes) {
        themeCounts[theme] = (themeCounts[theme] ?? 0) + 1;
      }

      return {
        totalSessions,
        totalMessages,
        totalParticipants: uniqueEmails.size,
        avgDurationSeconds: Math.round(avgDuration),
        topThemes: Object.entries(themeCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10),
      };
    }),
});
