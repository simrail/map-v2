import React, { useContext, useState } from "react";

interface Theme {
    theme: 'light' | 'dark';
    setTheme: (theme: string) => void;
}

interface ThemeProviderProps {
    children: React.ReactNode;
}

export const ThemeContext = React.createContext<Theme>({
    theme: "light",
    setTheme: (theme: string) => { },
});

export const useTheme = () => useContext(ThemeContext);


export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {

    const [theme, setTheme] = useState<string>(() => {
        // Check if the theme is already stored in the local storage
        if (typeof window !== "undefined") {
            const storedTheme = localStorage.getItem("theme");

            let finalTheme = storedTheme ? storedTheme : "light";
            document.body.className = finalTheme;

            return finalTheme;
        }

        return "light";
    });

    const handleSetTheme = (theme: string) => {
        setTheme(theme);
        if (typeof window !== "undefined") {
            document.body.className = theme;
            localStorage.setItem("theme", theme);
        }
    };

    const value = {
        theme,
        setTheme: handleSetTheme,
    };

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
};