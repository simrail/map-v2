import React, { useContext, useState } from "react";

interface ShowSignalStatus {
    showSignalInfo: boolean;
    setShowSignalInfo: (theme: boolean) => void;
}

interface ShowSignalStatusProviderProps {
    children: React.ReactNode;
}

export const ShowSignalStatusContext = React.createContext<ShowSignalStatus>({
    showSignalInfo: true,
    setShowSignalInfo: (theme: boolean) => { },
});

export const useShowSignalStatus = () => useContext(ShowSignalStatusContext);


export const ShowSignalStatusProvider: React.FC<ShowSignalStatusProviderProps> = ({ children }) => {

    const [showSignalInfo, setShowSignalStatus] = useState<string>(() => {
        // Check if the theme is already stored in the local storage
        if (typeof window !== "undefined") {
            const storedShowSignalStatus = localStorage.getItem("theme");

            let finalShowSignalStatus = storedShowSignalStatus ? storedShowSignalStatus : "light";
            document.body.className = finalShowSignalStatus;

            return finalShowSignalStatus;
        }

        return "light";
    });

    const handleSetShowSignalStatus = (theme: boolean) => {
        setShowSignalStatus(theme);
        if (typeof window !== "undefined") {
            document.body.className = theme;
            localStorage.setItem("theme", theme);
        }
    };

    const value = {
        showSignalInfo,
        setShowSignalInfo: handleSetShowSignalStatus,
    };

    return (
        <ShowSignalStatusContext.Provider value={value}>{children}</ShowSignalStatusContext.Provider>
    );
};