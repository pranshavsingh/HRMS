import React from "react";
import { FlatList, FlatListProps, RefreshControl, StyleSheet, View } from "react-native";
import ListEmptyState from "./ListEmptyState";
import ListErrorState from "./ListErrorState";
import ListFooterLoader from "./ListFooterLoader";

interface PaginatedFlatListProps<T> extends Omit<FlatListProps<T>, "data" | "refreshControl"> {
  items: T[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error?: string;
  onRefresh: () => void;
  onLoadMore: () => void;
  onRetry?: () => void;
  emptyTitle?: string;
  emptySubtitle?: string;
}

export default function PaginatedFlatList<T>({
  items,
  loading,
  refreshing,
  loadingMore,
  hasMore,
  error,
  onRefresh,
  onLoadMore,
  onRetry,
  emptyTitle,
  emptySubtitle,
  contentContainerStyle,
  ...rest
}: PaginatedFlatListProps<T>) {
  const renderSkeleton = () => (
    <View style={styles.skeletonWrap}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard} />
      ))}
    </View>
  );

  return (
    <FlatList
      data={items}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.4}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2457D6" />
      }
      contentContainerStyle={[{ paddingBottom: 28 }, contentContainerStyle]}
      ListEmptyComponent={
        loading ? (
          renderSkeleton()
        ) : error ? (
          <ListErrorState message={error} onRetry={onRetry} />
        ) : (
          <ListEmptyState title={emptyTitle} subtitle={emptySubtitle} />
        )
      }
      ListFooterComponent={
        <ListFooterLoader
          loadingMore={loadingMore}
          hasMore={hasMore}
          itemCount={items.length}
          error={error}
          onRetry={onRetry}
        />
      }
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  skeletonWrap: {
    gap: 10,
    marginTop: 8,
  },
  skeletonCard: {
    height: 82,
    borderRadius: 14,
    backgroundColor: "#E8EEF7",
  },
});
