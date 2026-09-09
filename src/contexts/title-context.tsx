import React, { createContext, useState, useContext, ReactNode } from "react";

interface TitleContextType {
    title: string;
    setTitle: (title: string) => void;
}

const TitleContext = createContext<TitleContextType | undefined>(undefined);

export const TitleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [title, setTitle] = useState("Aximo");

    // Единственное место, где пишется document.title: заголовок собирается
    // здесь из состояния, а usePageTitle только это состояние задаёт.
    React.useEffect(() => {
        document.title = title === "Aximo" ? "Aximo" : `${title} | Aximo`;
    }, [title]);

    return (
        <TitleContext.Provider value={{ title, setTitle }}>
            {children}
        </TitleContext.Provider>
    );
};

export const useTitleContext = () => {
    const context = useContext(TitleContext);
    if (!context) {
        throw new Error("useTitleContext must be used within a TitleProvider");
    }
    return context;
};
