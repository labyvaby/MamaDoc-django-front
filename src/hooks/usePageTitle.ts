import { useEffect } from "react";
import { useTitleContext } from "../contexts/title-context";

/**
 * Заголовок страницы: и в шапке приложения, и во вкладке браузера.
 *
 * Сам `document.title` пишет `TitleProvider` — он же приписывает счётчик новых
 * заявок («(3) Брони | Aximo»). Здесь только состояние, иначе два эффекта
 * затирали бы заголовок друг друга.
 */
export const usePageTitle = (title: string) => {
  const { setTitle } = useTitleContext();

  useEffect(() => {
    setTitle(title);

    return () => {
      setTitle("Aximo");
    };
  }, [title, setTitle]);
};
