import type { Config } from "tailwindcss";

const config: Config = {
    content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
    theme: {
        extend: {
            keyframes: {
                drift: {
                    "0%, 100%": { transform: "translateY(0px)" },
                    "50%": { transform: "translateY(-12px)" },
                },
                "pulse-x": {
                    "0%": { transform: "translateX(-50px)" },
                    "100%": { transform: "translateX(100%)" },
                },
                ticker: {
                    "0%": { transform: "translateX(0)" },
                    "100%": { transform: "translateX(-50%)" },
                },
            },
            animation: {
                drift: "drift 10s ease-in-out infinite",
                "pulse-x": "pulse-x 3s linear infinite",
                ticker: "ticker 18s linear infinite",
            },
        },
    },
    plugins: [],
};

export default config;
