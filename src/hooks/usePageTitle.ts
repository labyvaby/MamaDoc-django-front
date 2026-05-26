import { useEffect } from "react";
import { useTitleContext } from "../contexts/title-context";

export const usePageTitle = (title: string) => {
  const { setTitle } = useTitleContext();

  useEffect(() => {
    setTitle(title);
    document.title = `${title} | Мама Доктор`;

    return () => {
      setTitle("Мама Доктор");
      document.title = "Мама Доктор";
    };
  }, [title, setTitle]);
};
