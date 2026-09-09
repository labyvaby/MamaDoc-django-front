import React, { createContext, useState, useContext, ReactNode } from "react";

interface TitleContextType {
    title: string;
    setTitle: (title: string) => void;
    /**
     * Число, которое приписывается к заголовку вкладки как «(3) …» — счётчик
     * того, что ждёт человека (новые заявки онлайн-записи). 0 — без счётчика.
     */
    badgeCount: number;
    setBadgeCount: (count: number) => void;
}

const TitleContext = createContext<TitleContextType | undefined>(undefined);

export const TitleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [title, setTitle] = useState("Aximo");
    const [badgeCount, setBadgeCount] = useState(0);

    // Единственное место, где пишется document.title. Раньше его ставил
    // usePageTitle, но счётчик новых заявок — второй источник, и два эффекта
    // затирали друг друга (кто отработал последним): счётчик пропадал на
    // любом ререндере страницы. Поэтому заголовок собирается здесь из
    // состояния, а usePageTitle и счётчик только это состояние задают.
    React.useEffect(() => {
        const base = title === "Aximo" ? "Aximo" : `${title} | Aximo`;
        document.title = badgeCount > 0 ? `(${badgeCount}) ${base}` : base;
    }, [title, badgeCount]);

    return (
        <TitleContext.Provider value={{ title, setTitle, badgeCount, setBadgeCount }}>
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
