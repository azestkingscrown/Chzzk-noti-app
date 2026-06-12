import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator, useColorScheme, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Linking from 'expo-linking';
import axios from 'axios';

// 푸쉬 알림 수신 동작 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface Channel {
  id: string;
  name: string;
  profileImageUrl: string;
}

export default function App() {
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
    inputBackground: isDarkMode ? '#2c2c2c' : '#ffffff',
    inputText: isDarkMode ? '#ffffff' : '#333333',
    inputBorder: isDarkMode ? '#444444' : '#dddddd',
    label: isDarkMode ? '#bbbbbb' : '#666666',
    subtitle: isDarkMode ? '#00e676' : '#333333',
  };

  const [channelId, setChannelId] = useState('');
  const [streamerName, setStreamerName] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [expoPushToken, setExpoPushToken] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 1. 알림 클릭 리스너 최우선 등록 (유실 방지)
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      try {
        const content = response.notification.request.content;
        let dataObj = content.data;
        if (typeof dataObj === 'string') {
          try { dataObj = JSON.parse(dataObj); } catch (e) {}
        }
        const url = dataObj?.url;
        if (url) {
          Linking.openURL(url).catch(err => console.error('Linking error:', err));
        }
      } catch (err) {
        console.error('ResponseListener error:', err);
      }
    });

    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      // 포그라운드 수신
    });

    // 2. 콜드 스타트 알림 반응 확인
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        try {
          const content = response.notification.request.content;
          let dataObj = content.data;
          if (typeof dataObj === 'string') {
            try { dataObj = JSON.parse(dataObj); } catch (e) {}
          }
          const url = dataObj?.url;
          if (url) {
            Linking.openURL(url).catch(err => console.error('Linking error:', err));
          }
        } catch (e) {
          console.error('Cold start notify error:', e);
        }
      }
    }).catch(err => console.error('getLastNotificationResponseAsync error:', err));

    // 3. 비동기 데이터 로딩 및 독립적 푸시 등록
    loadData();
    setTimeout(() => {
      registerForPushNotificationsAsync()
        .then(token => {
          if (token) setExpoPushToken(token);
        })
        .catch(err => {
          console.error('FCM Token Register Hang/Error bypass:', err);
        });
    }, 100);

    return () => {
      Notifications.removeNotificationSubscription(notificationListener);
      Notifications.removeNotificationSubscription(responseListener);
    };
  }, []);

  const loadData = async () => {
    try {
      let localChannels: Channel[] = [];
      const savedChannels = await AsyncStorage.getItem('channels_v3');
      if (savedChannels) {
        localChannels = JSON.parse(savedChannels);
      } else {
        // v2 마이그레이션
        const v2Channels = await AsyncStorage.getItem('channels_v2');
        if (v2Channels) {
          const parsed = JSON.parse(v2Channels);
          localChannels = parsed.map((c: any) => ({
            id: c.id,
            name: c.name,
            profileImageUrl: c.profileImageUrl || ''
          }));
        } else {
          // v1 마이그레이션
          const oldChannels = await AsyncStorage.getItem('channels');
          if (oldChannels) {
            const old = JSON.parse(oldChannels);
            localChannels = old.map((id: string) => ({ id, name: '이름없음', profileImageUrl: '' }));
          }
        }
      }

      // 서버의 최신 프로필 정보 및 스트리머 이름을 가져와 로컬 데이터와 동기화
      try {
        const response = await axios.get(`${serverUrl}/api/channels`, { timeout: 3000 });
        const serverMap = response.data;
        if (serverMap && typeof serverMap === 'object') {
          let updated = false;
          const syncedChannels = localChannels.map(c => {
            const serverInfo = serverMap[c.id];
            if (serverInfo) {
              if (c.profileImageUrl !== serverInfo.profileImageUrl || c.name !== serverInfo.name) {
                c.profileImageUrl = serverInfo.profileImageUrl || '';
                c.name = serverInfo.name || c.name;
                updated = true;
              }
            }
            return c;
          });
          if (updated) {
            localChannels = syncedChannels;
            await AsyncStorage.setItem('channels_v3', JSON.stringify(localChannels));
            console.log('로컬 채널 정보가 서버 최신 프로필 이미지 정보와 동기화되었습니다.');
          }
        }
      } catch (syncError) {
        console.warn('서버 채널 정보 동기화 실패 (Bypass):', syncError);
      }

      setChannels(localChannels);
    } catch (e) {
      console.error(e);
    }
  };

  const saveData = async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      console.error(e);
    }
  };

  async function registerForPushNotificationsAsync() {
    let token;
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        Alert.alert('권한 오류', '푸쉬 알림 권한이 필요합니다!');
        return;
      }
      token = (await Notifications.getDevicePushTokenAsync()).data;
    } else {
      Alert.alert('알림', '푸쉬 알림은 실제 기기에서만 작동합니다.');
    }
    return token;
  }

  const handleSubscribe = async () => {
    if (!channelId) {
      Alert.alert('입력 오류', '채널 ID를 입력해주세요.');
      return;
    }
    if (!expoPushToken) {
      Alert.alert('오류', '푸쉬 토큰을 가져오지 못했습니다. 기기 상태를 확인하세요.');
      return;
    }
    if (channels.some(c => c.id === channelId)) {
      Alert.alert('알림', '이미 등록된 채널입니다.');
      return;
    }

    setLoading(true);
    try {
      const finalName = streamerName || '스트리머';
      const response = await axios.post(`${serverUrl}/api/subscribe`, {
        token: expoPushToken,
        channelId: channelId,
        streamerName: finalName,
        profileImageUrl: profileImageUrl
      });

      if (response.data.success) {
        const savedName = response.data.streamerName || finalName;
        const savedImageUrl = response.data.profileImageUrl || profileImageUrl;
        const newChannels = [...channels, { id: channelId, name: savedName, profileImageUrl: savedImageUrl }];
        setChannels(newChannels);
        saveData('channels_v3', JSON.stringify(newChannels));
        setChannelId('');
        setStreamerName('');
        setProfileImageUrl('');
        Alert.alert('성공', `${savedName} 채널 알림이 등록되었습니다.`);
      } else {
        Alert.alert('오류', '구독에 실패했습니다.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('서버 오류', '서버에 연결할 수 없습니다. URL을 확인하세요.');
    }
    setLoading(false);
  };

  const handleUnsubscribe = async (id: string) => {
    setLoading(true);
    try {
      const response = await axios.post(`${serverUrl}/api/unsubscribe`, {
        token: expoPushToken,
        channelId: id,
      });

      if (response.data.success) {
        const newChannels = channels.filter(c => c.id !== id);
        setChannels(newChannels);
        saveData('channels_v3', JSON.stringify(newChannels));
        Alert.alert('성공', '알림이 해제되었습니다.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('서버 오류', '구독 취소 중 오류가 발생했습니다.');
    }
    setLoading(false);
  };

  const handleSearch = async () => {
    if (!searchKeyword) {
      Alert.alert('입력 오류', '검색할 스트리머 이름을 입력해주세요.');
      return;
    }
    setLoading(true);
    try {
      const response = await axios.get(`https://api.chzzk.naver.com/service/v1/search/channels?keyword=${encodeURIComponent(searchKeyword)}&size=1`, {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });
      const data = response.data;
      if (data && data.content && data.content.data && data.content.data.length > 0) {
        const foundChannel = data.content.data[0].channel;
        const followerText = foundChannel.followerCount 
          ? `${foundChannel.followerCount.toLocaleString()}명` 
          : '정보 없음';

        Alert.alert(
          '스트리머 확인',
          `찾으시는 스트리머가 맞습니까?\n\n이름: ${foundChannel.channelName}\n팔로워 수: ${followerText}`,
          [
            {
              text: '아니오',
              style: 'cancel',
              onPress: () => {
                Alert.alert(
                  '안내',
                  '찾으시는 스트리머가 아니라면, 해당 스트리머의 치지직 채널 고유 ID(32자리 영문/숫자)를 아래의 "채널 ID" 입력란에 직접 붙여넣어 등록해 주세요.'
                );
                setChannelId('');
                setStreamerName('');
                setProfileImageUrl('');
              }
            },
            {
              text: '예',
              onPress: () => {
                setChannelId(foundChannel.channelId);
                setStreamerName(foundChannel.channelName);
                setProfileImageUrl(foundChannel.channelImageUrl || '');
              }
            }
          ]
        );
      } else {
        Alert.alert('검색 실패', '해당 이름의 스트리머를 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('검색 오류', '스트리머 검색 중 오류가 발생했습니다.');
    }
    setLoading(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={styles.title}>치지직 커뮤니티 알림</Text>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.label }]}>스트리머 검색 (이름으로 찾기)</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 10, backgroundColor: theme.inputBackground, color: theme.inputText, borderColor: theme.inputBorder }]}
            value={searchKeyword}
            onChangeText={setSearchKeyword}
            placeholder="스트리머 이름 입력"
            placeholderTextColor={isDarkMode ? '#888' : '#aaa'}
          />
          <TouchableOpacity style={[styles.button, { backgroundColor: '#4285F4' }]} onPress={handleSearch} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>검색</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.label }]}>등록할 채널 확인</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 10, backgroundColor: theme.inputBackground, color: theme.inputText, borderColor: theme.inputBorder }]}
            value={channelId}
            onChangeText={setChannelId}
            placeholder="채널 ID (검색 시 자동 입력)"
            placeholderTextColor={isDarkMode ? '#888' : '#aaa'}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.button} onPress={handleSubscribe} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>등록</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.subtitle, { color: theme.subtitle }]}>등록된 채널 목록</Text>
      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.listItem, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
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
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.listTextName, { color: theme.text }]}>{item.name}</Text>
              <Text style={styles.listTextId}>{item.id}</Text>
            </View>
            <TouchableOpacity style={styles.deleteButton} onPress={() => handleUnsubscribe(item.id)}>
              <Text style={styles.deleteButtonText}>해제</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>등록된 채널이 없습니다.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00e676',
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 10,
  },
  inputGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    marginBottom: 5,
  },
  row: {
    flexDirection: 'row',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#00e676',
    padding: 15,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
  },
  profileImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  listTextName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  listTextId: {
    fontSize: 11,
    color: '#999',
  },
  deleteButton: {
    backgroundColor: '#ff5252',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
  },
});
