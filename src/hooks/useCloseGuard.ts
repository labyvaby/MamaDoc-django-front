import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Защита формы в модалке/дровере от случайного закрытия с несохранёнными
 * данными. Перехватывает все способы уйти:
 *  - клик мимо окна (backdropClick) и Esc — через `guardedClose` в onClose;
 *  - крестик и «Отмена» — тот же `guardedClose`;
 *  - «назад»/«вперёд» браузера и боковые кнопки мыши — через popstate;
 *  - закрытие вкладки, F5, уход по внешней ссылке — через beforeunload.
 *
 * Запись в истории ставится на всё время, пока окно открыто (а не только пока
 * форма «грязная»): так push и back парные, лишние записи не накапливаются при
 * наборе и стирании текста. Пока окно открыто, «назад» означает «закрыть окно»
 * — с подтверждением, если что-то введено, и молча, если нет.
 */

const GUARD_FLAG = "mamadocCloseGuard";

export function useCloseGuard({
  isDirty,
  isOpen = true,
  onClose,
}: {
  isDirty: boolean;
  isOpen?: boolean;
  onClose: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Через ref, чтобы обработчики истории ставились один раз на открытие окна и
  // не переподписывались на каждый введённый символ.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Вызывается, когда пользователь пытается закрыть окно.
  const guardedClose = useCallback(() => {
    if (isDirtyRef.current) {
      setConfirmOpen(true);
    } else {
      onCloseRef.current();
    }
  }, []);

  // Предупреждение браузера при закрытии вкладки / перезагрузке.
  useEffect(() => {
    if (!isOpen || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isOpen, isDirty]);

  // Кнопки «назад»/«вперёд» — и на клавиатуре, и боковые кнопки мыши: браузер
  // отдаёт их одинаково, событием popstate.
  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ ...window.history.state, [GUARD_FLAG]: true }, "");
    let armed = true;

    const handler = () => {
      if (!armed) return;
      // Съеденную запись возвращаем: следующее «назад» тоже должно прийти сюда,
      // а не увести со страницы приёма.
      window.history.pushState({ ...window.history.state, [GUARD_FLAG]: true }, "");
      guardedClose();
    };

    window.addEventListener("popstate", handler);
    return () => {
      armed = false;
      window.removeEventListener("popstate", handler);
      // Снимаем свою запись, чтобы после закрытия окна «назад» работало как обычно.
      if (window.history.state?.[GUARD_FLAG]) window.history.back();
    };
  }, [isOpen, guardedClose]);

  // Окно закрылось (в том числе программно) — подтверждение больше не нужно.
  useEffect(() => {
    if (!isOpen) setConfirmOpen(false);
  }, [isOpen]);

  /** Подтверждение — закрыть без сохранения. */
  const confirmClose = useCallback(() => {
    setConfirmOpen(false);
    onCloseRef.current();
  }, []);

  /** Отмена — остаться в форме. */
  const cancelClose = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  return { guardedClose, confirmOpen, confirmClose, cancelClose };
}

export default useCloseGuard;
