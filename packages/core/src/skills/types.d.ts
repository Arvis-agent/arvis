export interface Skill {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    filePath: string;
    triggerPatterns: {
        keywords: string[];
        patterns: string[];
    };
    requiredTools: string[];
    category: string | null;
    enabled: boolean;
    version: string;
    content: string;
}
//# sourceMappingURL=types.d.ts.map