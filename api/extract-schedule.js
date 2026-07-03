import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { images } = req.body || {};

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "No screenshots provided." });
    }

    if (images.length > 12) {
      return res.status(400).json({ error: "Upload 12 screenshots or fewer at a time." });
    }

    const prompt = `Extract course timetable information from these screenshots and convert it into JSON for Timetable Studio.

Rules:
- Output ONLY valid JSON. No explanation and no markdown fences.
- Use:
{
  "title": "Fall",
  "courses": [
    {
      "code": "BIO360",
      "name": "Biometrics I",
      "color": "#dbeafe",
      "visibility": "visible",
      "meetings": [
        {
          "type": "Lecture",
          "section": "LEC0101",
          "day": "Monday",
          "start": "15:00",
          "end": "17:00",
          "location": "IB 345",
          "notes": ""
        }
      ]
    }
  ]
}
- If both Fall and Winter are present, use {"timetables":[...]}.
- Each course should be one course object.
- Put Lecture, Tutorial, and Practical times as separate meetings inside the same course.
- If a course has multiple tutorial or practical options, include ALL options.
- Use type as one of: Lecture, Tutorial, Practical, Other.
- Use full day names.
- Use 24-hour time.
- Put building and room together in location.
- If something is unclear, put CHECK in notes.`;

    const content = [
      { type: "input_text", text: prompt },
      ...images.map((imageUrl) => ({
        type: "input_image",
        image_url: imageUrl
      }))
    ];

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      input: [
        {
          role: "user",
          content
        }
      ]
    });

    return res.status(200).json({
      text: response.output_text
    });
  } catch (error) {
    return res.status(500).json({
      error: "Extraction failed.",
      details: error?.message || String(error)
    });
  }
}
