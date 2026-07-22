import { useEffect } from "react";
import { useTitleContext } from "../contexts/title-context";

export const usePageTitle = (title: string) => {
  const { setTitle } = useTitleContext();

  useEffect(() => {
    setTitle(title);
    document.title = `${title} | Aximo`;

    return () => {
      setTitle("Aximo");
      document.title = "Aximo";
    };
  }, [title, setTitle]);
};
