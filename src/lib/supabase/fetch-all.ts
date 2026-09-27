type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_ID_CHUNK_SIZE = 100;

export async function fetchAllPages<T>(
  queryForPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await queryForPage(from, to);
    if (error) throw error;

    const pageRows = data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) break;
  }

  return rows;
}

export async function fetchAllPagesByIdChunks<T>(
  ids: string[],
  queryForChunkPage: (ids: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
  options: { chunkSize?: number; pageSize?: number } = {},
) {
  const rows: T[] = [];
  const chunkSize = options.chunkSize ?? DEFAULT_ID_CHUNK_SIZE;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const chunkRows = await fetchAllPages<T>((from, to) => queryForChunkPage(chunk, from, to), pageSize);
    rows.push(...chunkRows);
  }

  return rows;
}
