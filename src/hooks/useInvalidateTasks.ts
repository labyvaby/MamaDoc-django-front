import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { djangoQueryKeys } from "../api/queryKeys";

/**
 * Сбрасывает кэш модуля задач после любой мутации (создание, взятие,
 * исполнение, подтверждение, комментарий).
 *
 * `refetchType: "all"` здесь принципиален: бейдж «Задачи» в сайдбаре наблюдает
 * тот же `tasks.summary`, и его наблюдатель может оказаться неактивным в момент
 * действия (сайдбар свёрнут в мобильном режиме, страница задач размонтирована,
 * запрос ещё не включён из-за загрузки прав). При дефолтном
 * `refetchType: "active"` такой запрос только помечается устаревшим — цифра
 * остаётся старой до перезагрузки страницы.
 */
export function useInvalidateTasks(): () => void {
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: djangoQueryKeys.tasks.all,
      refetchType: "all",
    });
  }, [queryClient]);
}

export default useInvalidateTasks;
