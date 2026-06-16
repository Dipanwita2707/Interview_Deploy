/**
 * GET /api/seed-interview-template
 *
 * One-time setup endpoint. Visit http://localhost:3000/api/seed-interview-template
 * in your browser to pre-create a default interview template so the exam bridge
 * can find it instantly without timing out.
 *
 * Safe to call multiple times — uses upsert / existence checks.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    // ── 1. Check if a template already exists ────────────────────────────────
    const { data: existingInterview } = await supabaseAdmin
      .from("interviews")
      .select("id, title")
      .eq("isActive", true)
      .limit(1)
      .maybeSingle();

    if (existingInterview) {
      return NextResponse.json({
        success: true,
        message: "✅ Interview template already exists — no action needed.",
        interviewId: existingInterview.id,
        title: existingInterview.title,
      });
    }

    // ── 2. Get or create a user profile ────────────────────────────────────
    let userId: string;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (profile) {
      userId = profile.id;
    } else {
      console.log("No profiles found. Auto-creating developer auth user...");
      const email = 'developer@smartcode.com';
      const password = 'DeveloperPassword123!';
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name: 'Developer Student',
          full_name: 'Developer Student'
        }
      });

      if (authError || !authUser?.user) {
        // Fallback manually inserting profile
        const fallbackId = '00000000-0000-0000-0000-000000000000';
        await supabaseAdmin.from("profiles").upsert({
          id: fallbackId,
          email,
          name: 'Developer Student'
        });
        userId = fallbackId;
      } else {
        userId = authUser.user.id;
        // Wait a brief moment for DB trigger (handle_new_user)
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // ── 3. Get or create an organization ──────────────────────────────────
    let { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("ownerId", userId)
      .limit(1)
      .maybeSingle();

    if (!org) {
      const { data: newOrg } = await supabaseAdmin
        .from("organizations")
        .insert({
          name: "Default Organization",
          slug: "default-org-" + Math.random().toString(36).substring(2, 8),
          ownerId: userId,
        })
        .select("id")
        .maybeSingle();
      org = newOrg;

      // Add owner to members
      if (org) {
        await supabaseAdmin.from("organization_members").upsert(
          { workspaceId: org.id, userId, role: "OWNER" },
          { onConflict: "workspaceId,userId" }
        );
      }
    }

    if (!org) {
      return NextResponse.json(
        { success: false, error: "Failed to create organization" },
        { status: 500 }
      );
    }

    // ── 4. Get or create a project ──────────────────────────────────────
    let { data: project } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("organizationId", org.id)
      .limit(1)
      .maybeSingle();

    if (!project) {
      const { data: newProject } = await supabaseAdmin
        .from("projects")
        .insert({
          organizationId: org.id,
          name: "Default Project",
          createdBy: userId,
        })
        .select("id")
        .maybeSingle();
      project = newProject;
    }

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Failed to create project" },
        { status: 500 }
      );
    }

    // ── 5. Create the default interview template ──────────────────────────
    const { data: interview, error: interviewError } = await supabaseAdmin
      .from("interviews")
      .insert({
        title: "Coding Exam Follow-up Interview",
        description:
          "AI-powered follow-up interview triggered automatically after a student completes a coding exam. The interviewer will ask about the student's approach, discuss their weak areas, and assess their overall understanding.",
        objective:
          "Evaluate the student's problem-solving ability, code quality understanding, and depth of knowledge in the topics they struggled with.",
        userId,
        projectId: project.id,
        isActive: true,
        mode: "CHAT",
        chatEnabled: true,
        voiceEnabled: false,
        aiName: "SMART Interviewer",
        aiTone: "PROFESSIONAL",
        followUpDepth: "MODERATE",
        requireInvite: true,
        examCompany: "test",
      })
      .select("id")
      .maybeSingle();

    if (interviewError || !interview) {
      return NextResponse.json(
        {
          success: false,
          error: interviewError?.message ?? "Failed to create interview template",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "✅ Default interview template created successfully! The exam bridge will now work end-to-end.",
      interviewId: interview.id,
      orgId: org.id,
      projectId: project.id,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
