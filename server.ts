import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY || "AQ.Ab8RN6Ll1Sy4sI3wJtjwxHhYDlAH0DSP6fvdpxYs9sZ2X1vmvw";

const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

app.post("/api/recipes/generate", async (req, res) => {
  try {
    const {
      ingredients = [],
      preference = "any",
      caloriePreference = "any",
      spicePreference = "any",
      maxCookTimeMinutes,
      equipment,
      excludeTitles = [],
    } = req.body;

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one ingredient.",
      });
    }

    const cleanIngredients = ingredients.map((i: string) => i.trim()).filter(Boolean);
    if (cleanIngredients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid ingredients.",
      });
    }

    const dietaryGuidance =
      preference === "vegan"
        ? "Dietary preference: Strictly VEGAN (100% plant-based: no meat, poultry, seafood, dairy, eggs, or animal products)."
        : preference === "vegetarian"
        ? "Dietary preference: Strictly VEGETARIAN (no meat, poultry, or fish/seafood; dairy and eggs are permitted)."
        : preference === "non-vegetarian"
        ? "Dietary preference: Non-vegetarian (can include meat, poultry, fish/seafood, or hearty proteins)."
        : "Dietary preference: Flexible (can be vegetarian, vegan, or non-vegetarian).";

    const calorieGuidance =
      caloriePreference === "low"
        ? "Calorie Preference: Strictly LOW CALORIE / Light (<400 kcal per serving). Keep extra oils, sugars, and heavy fats minimal; prioritize high-volume satisfying foods."
        : caloriePreference === "high"
        ? "Calorie Preference: HIGH CALORIE / High-Energy Bulking (>650 kcal per serving). Focus on energy-dense, satisfying meals with hearty portions, protein, and healthy fats."
        : caloriePreference === "balanced"
        ? "Calorie Preference: BALANCED meal (400 - 650 kcal per serving)."
        : "Calorie Preference: Flexible / Any reasonable student meal portion.";

    const spiceGuidance =
      spicePreference === "mild"
        ? "Spice Level: MILD / No Heat (comfort food, gentle savory flavors, no spicy chilis or hot sauces)."
        : spicePreference === "medium"
        ? "Spice Level: MEDIUM (a pleasant kick, light black pepper, gentle paprika, or hint of sriracha)."
        : spicePreference === "spicy"
        ? "Spice Level: SPICY / BOLD HEAT (distinct chili flakes, hot sauce, jalapeño, or fiery seasoning popular with students)."
        : "Spice Level: Flexible / Any spice profile.";

    const promptDetails = [
      `User available ingredients: ${cleanIngredients.join(", ")}.`,
      dietaryGuidance,
      calorieGuidance,
      spiceGuidance,
      maxCookTimeMinutes ? `Maximum cooking time: ${maxCookTimeMinutes} minutes.` : "Target cooking time: 10 to 25 minutes (college student quick meal).",
      equipment ? `Preferred equipment/constraints: ${equipment}.` : "Equipment constraints: Common college dorm or apartment appliances (microwave, single pan/skillet, toaster, kettle, or single pot).",
      excludeTitles.length > 0
        ? `IMPORTANT: The user wants MORE suggestions! Do NOT repeat or closely resemble these existing recipe suggestions: ${excludeTitles.join(", ")}. Provide 4 completely fresh, distinct, and creative recipes.`
        : "Provide 4 simple, distinct, highly practical, and delicious recipes tailored for college students.",
    ].join("\n");

    const systemInstruction = `You are "Chef Dorm", an expert, encouraging AI culinary advisor specifically helping college students.
Your specialty is inventing ultra-practical, budget-conscious, and delicious meals using whatever random ingredients students have in their dorm room or apartment fridge.
Guidelines:
1. Prioritize using the ingredients provided by the user. Only assume basic pantry staples that virtually all students have access to (salt, black pepper, cooking oil, butter, water, sugar, or microwave).
2. Keep dishes simple, fast (under 25 mins when possible), with minimal dishes to wash.
3. Respect all 4 preferences strictly (Dietary, Calorie, Spice Level, and Cook Time).
4. Respect calorie preferences accurately: calculate a realistic estimated calorie count (kcal) per serving and provide a descriptive calorie tag.
5. Provide a clever "dormTip" for each recipe (e.g. how to cook rice in a mug, microwave bacon, substitute an ingredient, or clean with zero hassle).
6. Always return exactly 4 recipes matching the requested JSON schema.`;

    const generateWithModel = async (modelName: string) => {
      return await ai.models.generateContent({
        model: modelName,
        contents: promptDetails,
        config: {
          systemInstruction,
          temperature: 0.8,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "4 practical college student recipes with calorie and spice info",
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                tagline: { type: Type.STRING },
                dietary: { type: Type.STRING },
                cookingTimeMinutes: { type: Type.INTEGER },
                estimatedCalories: { type: Type.INTEGER, description: "Estimated total calories per serving, e.g. 350, 520, 780" },
                calorieTag: { type: Type.STRING, description: "Short tag e.g. 'Low Calorie (<400 kcal)', 'Balanced (400-650 kcal)', 'High Energy (>650 kcal)'" },
                spiceLevel: { type: Type.STRING, description: "e.g. 'Mild', 'Medium', 'Spicy', or 'Fiery'" },
                difficulty: { type: Type.STRING },
                equipment: { type: Type.STRING },
                estimatedCost: { type: Type.STRING },
                ingredients: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      item: { type: Type.STRING },
                      amount: { type: Type.STRING },
                      fromUserList: { type: Type.BOOLEAN },
                    },
                    required: ["item", "amount", "fromUserList"],
                  },
                },
                steps: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                dormTip: { type: Type.STRING },
                nutritionNote: { type: Type.STRING },
              },
              required: [
                "id",
                "title",
                "tagline",
                "dietary",
                "cookingTimeMinutes",
                "estimatedCalories",
                "calorieTag",
                "difficulty",
                "equipment",
                "estimatedCost",
                "ingredients",
                "steps",
                "dormTip",
                "nutritionNote",
              ],
            },
          },
        },
      });
    };

    let response;
    try {
      response = await generateWithModel("gemini-3.1-flash-lite");
    } catch {
      // Fallback if needed
      response = await generateWithModel("gemini-flash-latest");
    }

    const responseText = response.text?.trim() || "[]";
    const recipes = JSON.parse(responseText);

    return res.json({
      success: true,
      recipes,
    });
  } catch (error: any) {
    console.error("Error generating recipes:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to generate recipes. Please try again.",
    });
  }
});

// Start dev Vite or serve production build
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
