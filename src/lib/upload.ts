import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export async function uploadReceipt(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || ".jpg";
  const filename = `${randomUUID()}${ext}`;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;
    const bucket = process.env.SUPABASE_RECEIPTS_BUCKET || "receipts";
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filename, buffer, { contentType: file.type });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from(bucket).getPublicUrl(filename);
    return data.publicUrl;
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads", "receipts");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, filename), buffer);
  return `/uploads/receipts/${filename}`;
}
