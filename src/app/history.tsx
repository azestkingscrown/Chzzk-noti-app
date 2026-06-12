import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Alert, ActivityIndicator, RefreshControl, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import axios from 'axios';
import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';

export default function HistoryScreen() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const serverUrl = 'https://YOUR_SERVER_URL';
  
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  // 다이나믹 테마 색상 정의
  const theme = {
    background: isDarkMode ? '#121212' : '#f5f7fa',
    cardBackground: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#333333',
    subText: isDarkMode ? '#aaaaaa' : '#666666',
    border: isDarkMode ? '#2c2c2c' : '#dddddd',
    headerText: isDarkMode ? '#00e676' : '#00e676',
    clearText: '#ff5252',
  };

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await axios.get(`${serverUrl}/api/history`);
      if (Array.isArray(response.data)) {
        setHistory(response.data);
      }
    } catch (e: any) {
      console.error('Failed to load history:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory(false);
  };

  const handlePress = (url: string) => {
    if (url) {
      Linking.openURL(url).catch(err => {
        Alert.alert('오류', '링크를 열 수 없습니다.');
      });
    } else {
      Alert.alert('오류', '이동할 URL이 없습니다.');
    }
  };

  // 개별 알림 삭제 API 연동
  const deleteNotification = async (id: string) => {
    try {
      const response = await axios.post(`${serverUrl}/api/history/delete`, { id });
      if (response.data.success) {
        setHistory(prev => prev.filter(item => item.id !== id));
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('오류', '알림 삭제에 실패했습니다.');
    }
  };

  // 일괄 알림 삭제 API 연동
  const clearHistory = async () => {
    Alert.alert('기록 일괄 삭제', '모든 알림 기록을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try {
          const response = await axios.post(`${serverUrl}/api/history/clear`);
          if (response.data.success) {
            setHistory([]);
          }
        } catch (e) {
          console.error(e);
          Alert.alert('오류', '전체 삭제에 실패했습니다.');
        }
      }}
    ]);
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.headerText }]}>알림 기록</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {history.length > 0 && (
            <TouchableOpacity onPress={clearHistory} style={{ marginRight: 15 }}>
              <Text style={[styles.clearText, { color: theme.clearText }]}>전체 삭제</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => loadHistory(true)}>
            <Text style={styles.refreshText}>새로고침</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && history.length === 0 ? (
        <ActivityIndicator size="large" color="#00e676" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item, index) => item.id || index.toString()}
          refreshControl = {
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#00e676']} />
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => handlePress(item.url)}>
                {item.profileImageUrl ? (
                  <Image 
                    source={{ uri: `${serverUrl}/api/image-proxy?url=${encodeURIComponent(item.profileImageUrl)}` }} 
                    style={styles.profileImage} 
                  />
                ) : (
                  <View style={[styles.profileImage, { backgroundColor: isDarkMode ? '#333' : '#ccc', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: isDarkMode ? '#666' : '#fff', fontSize: 10 }}>공백</Text>
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
                  </View>
                  <Text style={[styles.cardBody, { color: theme.subText }]} numberOfLines={2}>{item.body}</Text>
                </View>
              </TouchableOpacity>
              
              {/* 개별 삭제 버튼 */}
              <TouchableOpacity style={styles.deleteButton} onPress={() => deleteNotification(item.id)}>
                <Text style={styles.deleteButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              받은 알림 기록이 없습니다.{"\n"}새 글 알림이 오면 여기에 자동으로 표시됩니다.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  clearText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  refreshText: {
    color: '#00e676',
    fontWeight: 'bold',
    fontSize: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    flex: 1,
  },
  cardDate: {
    fontSize: 11,
    color: '#999',
    marginLeft: 8,
  },
  cardBody: {
    fontSize: 13,
  },
  deleteButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#ff5252',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    lineHeight: 20,
  },
});
