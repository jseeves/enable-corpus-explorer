import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

/** Returns the corpus map data: every doc with metadata + UMAP (x, y).
 *
 * In production, this could come from Pinecone (querying all vectors with metadata)
 * or from a static JSON file in the deployment. The starter approach is the
 * static file: ingestion produces data/derived/umap.json; copy it to app/public/
 * before deploying. The route just reads from there.
 */
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "public", "umap.json");
    const data = await fs.readFile(filePath, "utf-8");
    return new NextResponse(data, {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Corpus map not found. Run `python -m ingestion.pipeline ...` to generate data/derived/umap.json, then copy it to app/public/umap.json.",
      },
      { status: 404 },
    );
  }
}
