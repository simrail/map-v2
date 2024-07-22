import React, { useContext, useState } from "react";

interface Theme {
    theme: 'light' | 'dark';
    setTheme: (theme: 'light' | 'dark') => void;
}

interface ThemeProviderProps {
    children: React.ReactNode;
}

export const ThemeContext = React.createContext<Theme>({
    theme: "light",
    setTheme: (theme: 'light' | 'dark') => { },
});

export const useTheme = () => useContext(ThemeContext);


export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {

    const [theme, setTheme] = useState<"dark"|"light">(() => {
        // Check if the theme is already stored in the local storage
        if (typeof window !== "undefined") {
            const storedTheme = localStorage.getItem("theme");

            let finalTheme = storedTheme ? storedTheme : "light";
            document.body.className = finalTheme;

            return finalTheme as "dark" | "light";
        }

        return "light";
    });

    const handleSetTheme = (theme: "dark" | "light") => {
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