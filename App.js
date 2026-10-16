import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  request, getStoredUser, register, signIn, signOut, uploadPdf,
  requestPasswordReset, confirmPasswordReset, generateMockTest,
  uploadStudyResource, downloadStudyResource,
} from './api';

const COLORS = {
  ink: '#102A43',
  muted: '#486581',
  blue: '#1E3A8A',
  forest: '#0B6B3A',
  forestPale: '#E8F4EE',
  teal: '#0D9488',
  gold: '#FBBF24',
  goldPale: '#FFF7DF',
  pale: '#F8FCFF',
  border: '#DCE8EF',
  glass: 'rgba(255,255,255,0.88)',
  glassBorder: 'rgba(255,255,255,0.95)',
  white: '#ffffff',
  red: '#a83e37',
};
const DESIGN_TOKENS = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
  radius: { control: 14, card: 20, panel: 24, pill: 999 },
  typography: {
    screenTitle: { fontSize: 25, fontWeight: '800' },
    sectionTitle: { fontSize: 19, fontWeight: '800' },
    body: { fontSize: 14, lineHeight: 20 },
    caption: { fontSize: 12, lineHeight: 17 },
  },
  motion: { splash: 720 },
};
const SURFACE_SHADOW = {
  shadowColor: '#102A43',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
};
const EXAM_TYPES = ['Weekly Test 1', 'Weekly Test 2', 'CIA 1', 'CIA 2', 'End Semester'];
const ANDROID_GRANT_READ_URI_PERMISSION = 1;
const WELCOME_COMPLETE_KEY = 'campus_notes_welcome_complete';
const LAUNCH_SPLASH_DURATION_MS = 1400;
const PASSWORD_REQUIREMENTS = 'At least 8 characters, including one uppercase letter and one special symbol.';
const TAB_ICONS = {
  Home: '⌂',
  Browse: '⌕',
  'Mock Test': '✓',
  Materials: '▤',
  Account: '◉',
};
const DEFAULT_HOME_BANNER = {
  title: 'Every paper.\nOne place.',
  description: 'Find the right question paper and make your next study session count.',
  buttonLabel: 'Explore papers',
};

function isPasswordValid(password) {
  return password.length >= 8
    && /[A-Z]/.test(password)
    && /[^A-Za-z0-9\s]/.test(password);
}

function isEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isRegistrationTextValid(value) {
  return value.trim().length >= 2 && /[\p{L}\p{N}]/u.test(value);
}

function Field({
  label, value, onChangeText, placeholder, keyboardType, secureTextEntry, multiline, autoCapitalize, maxLength,
  showPasswordToggle, passwordVisible, onTogglePasswordVisibility, onFocus,
}) {
  const inputRef = useRef(null);

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={showPasswordToggle && styles.passwordInputRow}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => onFocus?.(inputRef.current)}
          placeholder={placeholder}
          placeholderTextColor="#8a95a7"
          accessibilityLabel={label || placeholder}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize || (secureTextEntry ? 'none' : undefined)}
          autoCorrect={!secureTextEntry}
          secureTextEntry={secureTextEntry && !passwordVisible}
          multiline={multiline}
          style={[
            styles.input,
            multiline && styles.multiline,
            showPasswordToggle && styles.passwordInput,
          ]}
        />
        {showPasswordToggle ? (
          <Pressable
            onPress={onTogglePasswordVisibility}
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
            style={styles.passwordToggle}
          >
            <Text style={styles.passwordToggleText}>{passwordVisible ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ActionButton({ title, onPress, disabled, secondary, compact, destructive }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        destructive && styles.destructiveButton,
        compact && styles.compactButton,
        disabled && styles.disabledButton,
      ]}
    >
      <Text style={[
        styles.buttonText,
        secondary && styles.secondaryButtonText,
        destructive && styles.destructiveButtonText,
      ]}>
        {title}
      </Text>
    </Pressable>
  );
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_SCAN_PAGES = 15;

async function createPdfFromPhotos(photos) {
  const pages = [];
  for (const photo of photos) {
    const base64 = await FileSystem.readAsStringAsync(photo.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const mimeType = photo.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    pages.push(`<section class="page"><img src="data:${mimeType};base64,${base64}" /></section>`);
  }
  const result = await Print.printToFileAsync({
    html: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>@page{size:A4;margin:0}html,body{margin:0;padding:0}.page{width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;page-break-after:always}.page:last-child{page-break-after:auto}img{max-width:100%;max-height:100%;object-fit:contain}</style>
      </head><body>${pages.join('')}</body></html>`,
  });
  const info = await FileSystem.getInfoAsync(result.uri);
  if (!info.exists) throw new Error('Could not create a PDF from the selected photos.');
  if (info.size > MAX_UPLOAD_BYTES) {
    throw new Error('The scanned PDF is larger than 20 MB. Use fewer or smaller photos.');
  }
  return {
    uri: result.uri,
    name: 'scanned-document.pdf',
    mimeType: 'application/pdf',
    size: info.size,
  };
}

function DocumentUploadPicker({ file, onFileChange, disabled }) {
  const [photos, setPhotos] = useState([]);
  const [creatingPdf, setCreatingPdf] = useState(false);

  function exceedsPhotoSizeLimit(selectedPhotos) {
    return selectedPhotos.reduce((size, photo) => size + (photo.fileSize || 0), 0) > MAX_UPLOAD_BYTES;
  }

  async function choosePdf() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        const selectedFile = result.assets[0];
        if (selectedFile.size !== undefined && selectedFile.size > MAX_UPLOAD_BYTES) {
          Alert.alert('File too large', 'PDF files must be 20 MB or smaller.');
          return;
        }
        setPhotos([]);
        onFileChange(selectedFile);
      }
    } catch (error) {
      Alert.alert('Could not open documents', error.message);
    }
  }

  async function choosePhotos() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_SCAN_PAGES,
        quality: 0.8,
      });
      if (!result.canceled) {
        if (exceedsPhotoSizeLimit(result.assets)) {
          Alert.alert('Photos too large', 'Choose photos with a combined size of 20 MB or less.');
          return;
        }
        setPhotos(result.assets);
        onFileChange(null);
      }
    } catch (error) {
      Alert.alert('Could not open photo gallery', error.message);
    }
  }

  async function scanPage() {
    try {
      if (photos.length >= MAX_SCAN_PAGES) {
        Alert.alert('Page limit reached', `A scan can contain up to ${MAX_SCAN_PAGES} photos.`);
        return;
      }
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera access required', 'Allow camera access to scan document pages.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!result.canceled) {
        const selectedPhotos = [...photos, result.assets[0]];
        if (exceedsPhotoSizeLimit(selectedPhotos)) {
          Alert.alert('Photos too large', 'Choose photos with a combined size of 20 MB or less.');
          return;
        }
        setPhotos(selectedPhotos);
        onFileChange(null);
      }
    } catch (error) {
      Alert.alert('Could not scan page', error.message);
    }
  }

  async function buildPdf() {
    if (!photos.length) return;
    setCreatingPdf(true);
    try {
      onFileChange(await createPdfFromPhotos(photos));
      setPhotos([]);
    } catch (error) {
      Alert.alert('Could not create scanned PDF', error.message);
    } finally {
      setCreatingPdf(false);
    }
  }

  function clearSelection() {
    setPhotos([]);
    onFileChange(null);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Choose a PDF or scan/select photos</Text>
      <View style={styles.actions}>
        <ActionButton title="Choose PDF" secondary compact onPress={choosePdf} disabled={disabled || creatingPdf} />
        <ActionButton title="Choose photos" secondary compact onPress={choosePhotos} disabled={disabled || creatingPdf} />
        <ActionButton
          title={photos.length ? 'Scan next page' : 'Scan pages'}
          secondary
          compact
          onPress={scanPage}
          disabled={disabled || creatingPdf}
        />
      </View>
      {photos.length ? (
        <>
          <Text style={styles.muted}>{photos.length} page{photos.length === 1 ? '' : 's'} selected (up to {MAX_SCAN_PAGES}).</Text>
          <View style={styles.actions}>
            <ActionButton
              title={creatingPdf ? 'Creating PDF…' : 'Create PDF from photos'}
              onPress={buildPdf}
              disabled={disabled || creatingPdf}
            />
            <ActionButton title="Clear" secondary onPress={clearSelection} disabled={disabled || creatingPdf} />
          </View>
        </>
      ) : null}
      {file ? (
        <View style={styles.rowBetween}>
          <Text style={styles.muted} numberOfLines={2}>{file.name}</Text>
          <ActionButton title="Remove" compact secondary onPress={clearSelection} disabled={disabled} />
        </View>
      ) : null}
    </View>
  );
}

function Notice({ message, onDismiss }) {
  if (!message) return null;
  return (
    <Pressable onPress={onDismiss} style={styles.notice}>
      <Text style={styles.noticeText}>{message}</Text>
      <Text style={styles.noticeDismiss}>Dismiss</Text>
    </Pressable>
  );
}

function LoadingState({ label, fullScreen = true }) {
  return (
    <View
      style={fullScreen ? styles.pageLoading : styles.libraryLoading}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <ActivityIndicator size={fullScreen ? 'large' : 'small'} color={COLORS.forest} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function LibraryStatus({ loading, error, onRetry, hasData }) {
  if (error) {
    return (
      <View style={styles.libraryError} accessibilityRole="alert">
        <Text style={styles.libraryErrorText}>
          {hasData ? 'Showing saved results. Could not refresh the library.' : 'Could not load the library.'} {error}
        </Text>
        <ActionButton title="Try again" secondary compact onPress={onRetry} />
      </View>
    );
  }
  if (!loading) return null;
  return <LoadingState fullScreen={false} label={hasData ? 'Updating the library…' : 'Loading the library…'} />;
}

function PaperCard({ paper, favorite, onFavorite, onOpen, onDownload, onShare }) {
  return (
    <View style={styles.paperCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.paperCardTitle}>{paper.subject}</Text>
        <Pressable
          onPress={onFavorite}
          accessibilityRole="button"
          accessibilityLabel={favorite ? `Remove ${paper.subject} from saved papers` : `Save ${paper.subject}`}
          hitSlop={8}
          style={styles.paperSaveButton}
        >
          <Text style={styles.favorite}>{favorite ? '★' : '☆'}</Text>
        </Pressable>
      </View>
      <View style={styles.paperMetaChips}>
        <Text style={styles.paperMetaChip}>{paper.departmentName || 'Department'}</Text>
        <Text style={styles.paperMetaChip}>Semester {paper.semester}</Text>
        <Text style={styles.paperMetaChip}>{paper.year}</Text>
      </View>
      <Text style={styles.paperExamType}>{paper.examType}</Text>
      {paper.subjectCode ? <Text style={styles.paperCode}>Subject code · {paper.subjectCode}</Text> : null}
      {paper.description ? <Text style={styles.description}>{paper.description}</Text> : null}
      <Text style={styles.paperUsage}>{paper.views || 0} views · {paper.downloads || 0} downloads</Text>
      <View style={styles.actions}>
        <ActionButton title="View" onPress={onOpen} disabled={!paper.fileUrl} />
        <ActionButton title="Download" secondary onPress={onDownload} disabled={!paper.fileUrl} />
        <ActionButton title="Share" secondary onPress={onShare} disabled={!paper.fileUrl} />
      </View>
    </View>
  );
}

function QuickAccessCard({ icon, title, description, onPress, tone }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      onPress={onPress}
      style={({ pressed }) => [styles.quickAccessCard, pressed && styles.pressed]}
    >
      <View style={[styles.quickAccessIcon, styles[`quickAccessIcon${tone}`]]}>
        <Text style={[styles.quickAccessIconText, styles[`quickAccessIconText${tone}`]]}>{icon}</Text>
      </View>
      <View style={styles.quickAccessCopy}>
        <Text style={styles.quickAccessTitle}>{title}</Text>
        <Text numberOfLines={2} style={styles.quickAccessDescription}>{description}</Text>
      </View>
      <Text style={styles.quickAccessArrow} accessible={false}>›</Text>
    </Pressable>
  );
}

function RecommendationSetup({ departments, onSaved }) {
  const [college, setCollege] = useState('');
  const [course, setCourse] = useState('');
  const [saving, setSaving] = useState(false);

  async function savePreferences() {
    setSaving(true);
    try {
      const result = await request('/api/recommendations/preferences', {
        method: 'POST',
        body: JSON.stringify({
          college_name: college.trim(),
          course_department_id: course,
        }),
      });
      onSaved(result.user);
    } catch (error) {
      Alert.alert('Could not save preferences', error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.homePreferenceCard}>
      <View style={styles.homePreferenceIcon}><Text style={styles.homePreferenceIconText}>★</Text></View>
      <Text style={styles.homeSectionTitle}>Personalize your picks</Text>
      <Text style={styles.homeSectionCaption}>Add your college and course to see relevant papers here.</Text>
      <Field
        label="College / university"
        value={college}
        onChangeText={setCollege}
        placeholder="Your college or university"
        maxLength={200}
      />
      <Text style={styles.label}>Course / department</Text>
      <View style={styles.picker}>
        <Picker selectedValue={course} onValueChange={setCourse}>
          <Picker.Item label="Choose your course" value="" />
          {departments.map((department) => (
            <Picker.Item
              key={department.id}
              label={`${department.name} (${department.code})`}
              value={department.id}
            />
          ))}
        </Picker>
      </View>
      <ActionButton
        title={saving ? 'Saving preferences…' : 'Show my recommendations'}
        onPress={savePreferences}
        disabled={saving || !isRegistrationTextValid(college) || !course}
      />
      <Text style={styles.homePreferenceFootnote}>These preferences are saved once and are separate from profile editing.</Text>
    </View>
  );
}

function HomeScreen({
  papers, departments, user, onPreferencesSaved, onBrowse, onBrowseDepartment, onSearch,
  onOpenPaper, onMockTest, onMaterials, onSignIn, compact,
  libraryLoading, libraryError, onRetryLibrary, sessionLoading,
}) {
  const [homeSearch, setHomeSearch] = useState('');
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsError, setRecommendationsError] = useState('');
  const [banner, setBanner] = useState(DEFAULT_HOME_BANNER);
  const [bannerError, setBannerError] = useState('');
  const [bannerLoading, setBannerLoading] = useState(true);
  const [bannerImageLoading, setBannerImageLoading] = useState(false);
  const [bannerImageFailed, setBannerImageFailed] = useState(false);
  const [bannerRequestVersion, setBannerRequestVersion] = useState(0);
  const hasPreferences = Boolean(user?.collegeName && user?.courseDepartmentId);
  const courseName = departments.find((department) => department.id === user?.courseDepartmentId)?.name;

  useEffect(() => {
    let active = true;
    if (user?.role === 'user' && hasPreferences) {
      request('/api/recommendations')
        .then((items) => {
          if (active) {
            setRecommendations(items);
            setRecommendationsError('');
          }
        })
        .catch((error) => {
          if (active) setRecommendationsError(error.message);
        });
    } else {
      setRecommendations([]);
      setRecommendationsError('');
    }
    return () => { active = false; };
  }, [user?.id, user?.role, user?.collegeName, user?.courseDepartmentId, hasPreferences]);

  useEffect(() => {
    let active = true;
    setBannerLoading(true);
    setBannerError('');
    request('/api/home-banner')
      .then((value) => {
        if (active) {
          setBanner(value || DEFAULT_HOME_BANNER);
          setBannerImageFailed(false);
          setBannerError('');
        }
      })
      .catch((error) => {
        if (active) setBannerError(error.message);
      })
      .finally(() => {
        if (active) setBannerLoading(false);
      });
    return () => { active = false; };
  }, [bannerRequestVersion]);

  const recent = useMemo(
    () => [...papers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5),
    [papers],
  );
  const popularSubjects = useMemo(
    () => [...new Set(papers.map((paper) => paper.subject).filter(Boolean))]
      .sort((first, second) => first.localeCompare(second))
      .slice(0, 4),
    [papers],
  );
  const greetingName = user?.name?.trim().split(/\s+/)[0] || 'Student';
  const hasBannerImage = Boolean(banner.imageUrl && !bannerImageFailed);
  const canBrowseMaterials = user?.role === 'user'
    || (user?.role === 'institute' && user.approvalStatus === 'approved');
  const quickActions = [
    {
      icon: '▤',
      title: 'Question papers',
      description: 'Browse the paper library',
      onPress: onBrowse,
      tone: 'Blue',
    },
    ...(canBrowseMaterials ? [{
      icon: '▧',
      title: 'Study materials',
      description: 'Explore shared resources',
      onPress: onMaterials,
      tone: 'Green',
    }] : []),
    ...(user?.role === 'user' ? [{
      icon: '✓',
      title: 'Mock tests',
      description: 'Practice with your papers',
      onPress: onMockTest,
      tone: 'Gold',
    }] : []),
    {
      icon: '◉',
      title: user ? 'My profile' : 'Sign in',
      description: user ? 'Account and preferences' : 'Access your account',
      onPress: onSignIn,
      tone: 'Teal',
    },
  ];

  if (sessionLoading || (libraryLoading && !papers.length && !departments.length)) {
    return <LoadingState label={sessionLoading ? 'Loading your account…' : 'Loading your dashboard…'} />;
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, styles.homeContent]}>
      <View style={styles.homeGreeting}>
        <Text style={styles.homeGreetingTitle}>Hello, {greetingName}!</Text>
        <Text style={styles.homeGreetingCopy}>Find the notes you need, build your future.</Text>
      </View>
      {banner ? (
        <View style={[
          styles.homeHero,
          hasBannerImage && styles.homeHeroWithImage,
          compact && styles.homeHeroCompact,
        ]}>
          {hasBannerImage ? (
            <Image
              key={`${banner.imageUrl}-${bannerRequestVersion}`}
              source={{ uri: banner.imageUrl }}
              style={styles.homeHeroImage}
              resizeMode="cover"
              accessible={false}
              onLoadStart={() => setBannerImageLoading(true)}
              onLoad={() => setBannerImageLoading(false)}
              onError={() => {
                setBannerImageLoading(false);
                setBannerImageFailed(true);
              }}
            />
          ) : null}
          {hasBannerImage ? (
            <View pointerEvents="none" style={styles.homeHeroImageOverlay} />
          ) : null}
          {!hasBannerImage ? (
            <View pointerEvents="none" style={styles.homeHeroDecorations}>
              <View style={styles.bannerSun} />
              <View style={[styles.bannerMountain, styles.bannerMountainBack]} />
              <View style={[styles.bannerMountain, styles.bannerMountainMiddle]} />
              <View style={[styles.bannerMountain, styles.bannerMountainFront]} />
              <View style={styles.bannerLandscape} />
              <View style={styles.bannerLandscapeFront} />
            </View>
          ) : null}
          <View style={styles.homeHeroContent}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroBadge}>
                <View style={styles.heroBadgeDot} />
                <Text style={[styles.heroBadgeText, hasBannerImage && styles.heroBadgeTextOnImage]}>
                  YOUR STUDY LIBRARY
                </Text>
              </View>
              {bannerImageLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} accessibilityLabel="Loading banner image" />
              ) : (
                <Text style={[styles.heroBookMark, hasBannerImage && styles.heroBookMarkOnImage]} accessibilityLabel="Campus-notes">CN</Text>
              )}
            </View>
            {bannerImageFailed ? (
              <Text style={styles.bannerImageNotice}>Banner image unavailable; showing the text banner.</Text>
            ) : null}
            <Text style={[
              styles.homeHeroTitle,
              compact && styles.homeHeroTitleCompact,
              hasBannerImage && styles.homeHeroTitleOnImage,
            ]}>
              {banner.title || DEFAULT_HOME_BANNER.title}
            </Text>
            <Text style={[styles.homeHeroCopy, hasBannerImage && styles.homeHeroCopyOnImage]}>
              {banner.description || DEFAULT_HOME_BANNER.description}
            </Text>
            <Pressable
              onPress={onBrowse}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.homeHeroButton,
                hasBannerImage && styles.homeHeroButtonOnImage,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.homeHeroButtonText, hasBannerImage && styles.homeHeroButtonTextOnImage]}>
                {banner.buttonLabel || DEFAULT_HOME_BANNER.buttonLabel}
              </Text>
              <Text style={styles.homeHeroButtonArrow}>›</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {bannerLoading ? (
        <LoadingState fullScreen={false} label="Loading the latest study banner…" />
      ) : null}
      {bannerError ? (
        <View style={styles.bannerError} accessibilityRole="alert">
          <Text style={styles.bannerErrorText}>
            Could not refresh the banner. Keeping the current home presentation. {bannerError}
          </Text>
          <ActionButton
            title="Retry"
            compact
            secondary
            onPress={() => {
              setBannerError('');
              setBannerRequestVersion((version) => version + 1);
            }}
          />
        </View>
      ) : null}
      <View style={styles.homeSearchCard}>
        <View style={styles.homeSearchIcon}><Text style={styles.homeSearchIconText}>⌕</Text></View>
        <TextInput
          accessibilityLabel="Search notes, subjects, or courses"
          value={homeSearch}
          onChangeText={setHomeSearch}
          onSubmitEditing={() => onSearch(homeSearch.trim())}
          placeholder="Search for notes, subjects, courses..."
          placeholderTextColor="#75827d"
          returnKeyType="search"
          style={styles.homeSearchInput}
        />
        {homeSearch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setHomeSearch('')}
            style={styles.homeSearchClear}
          >
            <Text style={styles.homeSearchClearText}>×</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search the library"
          onPress={() => onSearch(homeSearch.trim())}
          style={styles.homeSearchButton}
        >
          <Text style={styles.homeSearchButtonText}>⌕</Text>
        </Pressable>
      </View>
      <View style={styles.quickAccessSection}>
        <View style={styles.homeSectionHeading}>
          <View>
            <Text style={styles.homeSectionTitle}>Quick access</Text>
            <Text style={styles.homeSectionCaption}>Jump back into your studies</Text>
          </View>
        </View>
        <View style={styles.quickAccessGrid}>
          {quickActions.map((action) => (
            <QuickAccessCard key={action.title} {...action} />
          ))}
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.homeQuickFilters}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onBrowse}
          style={styles.homeQuickFilterSelected}
        >
          <Text style={styles.homeQuickFilterSelectedText}>All papers</Text>
        </Pressable>
        {departments.slice(0, 5).map((department) => (
          <Pressable
            key={department.id}
            accessibilityRole="button"
            accessibilityLabel={`Browse ${department.name}`}
            onPress={() => onBrowseDepartment(department.id)}
            style={styles.homeQuickFilter}
          >
            <Text style={styles.homeQuickFilterIcon}>▦</Text>
            <Text style={styles.homeQuickFilterText} numberOfLines={1}>{department.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.homeSectionHeading}>
        <View>
          <Text style={styles.homeSectionTitle}>Popular subjects</Text>
          <Text style={styles.homeSectionCaption}>Explore papers by subject</Text>
        </View>
        <Pressable onPress={onBrowse} accessibilityRole="button" style={styles.seeAllButton}>
          <Text style={styles.seeAllText}>View all</Text>
          <Text style={styles.seeAllArrow}>›</Text>
        </Pressable>
      </View>
      {popularSubjects.length ? (
        <View style={styles.homeSubjectsGrid}>
          {popularSubjects.map((subject, index) => (
            <Pressable
              key={subject}
              accessibilityRole="button"
              accessibilityLabel={`Browse ${subject} papers`}
              onPress={() => onSearch(subject)}
              style={[styles.homeSubjectCard, styles[`homeSubjectCard${index}`]]}
            >
              <View style={[styles.homeSubjectIcon, styles[`homeSubjectIcon${index}`]]}>
                <Text style={styles.homeSubjectIconText}>{subject.trim().charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.homeSubjectName} numberOfLines={2}>{subject}</Text>
            </Pressable>
          ))}
        </View>
      ) : libraryLoading || libraryError ? null : (
        <View style={styles.homeEmptyCard}>
          <Text style={styles.homeEmptyTitle}>Subjects will appear here</Text>
          <Text style={styles.homeEmptyCopy}>Browse the library as soon as papers are added.</Text>
        </View>
      )}
      <LibraryStatus
        loading={libraryLoading}
        error={libraryError}
        onRetry={onRetryLibrary}
        hasData={papers.length > 0 || departments.length > 0}
      />
      {user?.role === 'user' && !hasPreferences ? (
        <RecommendationSetup departments={departments} onSaved={onPreferencesSaved} />
      ) : null}
      {user?.role === 'user' && hasPreferences ? (
        <>
          <View style={styles.homeRecentHeading}>
            <View>
              <Text style={styles.homeSectionTitle}>Picked for you</Text>
              <Text style={styles.homeSectionCaption}>
                {courseName || 'Your course'} · {user.collegeName}
              </Text>
            </View>
            <Text style={styles.recommendationSparkle}>✦</Text>
          </View>
          {recommendationsError ? (
            <Text style={styles.errorText}>Could not load recommendations: {recommendationsError}</Text>
          ) : recommendations.length ? recommendations.map((paper) => (
            <View key={`recommended-${paper.id}`} style={styles.homePaperCard}>
              <View style={[styles.paperIcon, styles.recommendedPaperIcon]}>
                <Text style={[styles.paperIconText, styles.recommendedPaperIconText]}>✦</Text>
              </View>
              <Pressable
                style={styles.homePaperInfo}
                onPress={() => onOpenPaper(paper)}
                accessibilityRole="button"
                accessibilityLabel={`Read recommended paper ${paper.subject}`}
              >
                <Text numberOfLines={1} style={styles.homePaperTitle}>{paper.subject}</Text>
                <Text numberOfLines={1} style={styles.homePaperMeta}>
                  {paper.departmentName || 'Department'} · {paper.recommendationReason}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onOpenPaper(paper)}
                disabled={!paper.fileUrl}
                accessibilityRole="button"
                accessibilityLabel={`Open ${paper.subject}`}
                style={({ pressed }) => [styles.homePaperArrow, pressed && styles.pressed]}
              >
                <Text style={[styles.homePaperArrowText, !paper.fileUrl && styles.disabledArrow]}>›</Text>
              </Pressable>
            </View>
          )) : (
            <View style={styles.homeRecommendationEmpty}>
              <Text style={styles.homeRecommendationEmptyText}>
                No matching PDFs yet. New papers from your course or college will appear here.
              </Text>
            </View>
          )}
        </>
      ) : null}
      <View style={styles.homeRecentHeading}>
        <View>
          <Text style={styles.homeSectionTitle}>Recent resources</Text>
          <Text style={styles.homeSectionCaption}>Fresh papers, ready to explore</Text>
        </View>
        <Pressable onPress={onBrowse} accessibilityRole="button" style={styles.seeAllButton}>
          <Text style={styles.seeAllText}>See all</Text>
          <Text style={styles.seeAllArrow}>›</Text>
        </Pressable>
      </View>
      {recent.length ? recent.map((paper) => (
        <View key={paper.id} style={styles.homePaperCard}>
          <View style={styles.paperIcon}>
            <Text style={styles.paperIconText}>PDF</Text>
          </View>
          <Pressable
            style={styles.homePaperInfo}
            onPress={() => onOpenPaper(paper)}
            accessibilityRole="button"
            accessibilityLabel={`Read ${paper.subject}`}
          >
            <Text numberOfLines={1} style={styles.homePaperTitle}>{paper.subject}</Text>
            <Text numberOfLines={1} style={styles.homePaperMeta}>
              {paper.departmentName || 'Department'}  ·  {paper.examType}  ·  {paper.year}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onOpenPaper(paper)}
            disabled={!paper.fileUrl}
            accessibilityRole="button"
            accessibilityLabel={`Open ${paper.subject}`}
            style={({ pressed }) => [styles.homePaperArrow, pressed && styles.pressed]}
          >
            <Text style={[styles.homePaperArrowText, !paper.fileUrl && styles.disabledArrow]}>›</Text>
          </Pressable>
        </View>
      )) : libraryLoading || libraryError ? null : (
        <View style={styles.homeEmptyCard}>
          <View style={styles.emptyBookIcon}><Text style={styles.emptyBookIconText}>CN</Text></View>
          <Text style={styles.homeEmptyTitle}>Your library is getting ready</Text>
          <Text style={styles.homeEmptyCopy}>New question papers will show up here as soon as they are added.</Text>
          <ActionButton title="Browse library" compact secondary onPress={onBrowse} />
        </View>
      )}
      {user?.role === 'user' || !user ? (
        <View style={styles.homeMockCard}>
          <View style={styles.homeMockCopy}>
            <Text style={styles.homeMockTitle}>Ready to practice?</Text>
            <Text style={styles.homeMockDescription}>
              Build a mock test from uploaded papers and check your progress.
            </Text>
          </View>
          <ActionButton
            title={user?.role === 'user' ? 'Create a practice test' : 'Sign in to practice'}
            onPress={user?.role === 'user' ? onMockTest : onSignIn}
          />
        </View>
      ) : null}
      <View style={styles.homeBottomNote}>
        <Text style={styles.homeBottomNoteText}></Text>
      </View>
    </ScrollView>
  );
}

function BrowseScreen({
  papers, departments, user, favorites, initialDepartment, initialSearch, onFavorite, refresh, clearNotice, compact,
  libraryLoading, libraryError, onRetryLibrary,
}) {
  const [search, setSearch] = useState(initialSearch || '');
  const [department, setDepartment] = useState(initialDepartment || '');
  const [semester, setSemester] = useState('');
  const [examType, setExamType] = useState('');
  const [year, setYear] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const filtered = papers.filter((paper) => {
    const query = search.trim().toLowerCase();
    return (!query || `${paper.subject} ${paper.subjectCode || ''} ${paper.description || ''}`.toLowerCase().includes(query))
      && (!department || paper.departmentId === department)
      && (!semester || String(paper.semester) === semester)
      && (!examType || paper.examType === examType)
      && (!year || String(paper.year ?? '').includes(year))
      && (!favoritesOnly || favorites.includes(paper.id));
  });
  const sorted = [...filtered].sort((first, second) => {
    if (sortOrder === 'subject') return first.subject.localeCompare(second.subject);
    const firstDate = Date.parse(first.createdAt || '');
    const secondDate = Date.parse(second.createdAt || '');
    let comparison = Number.isFinite(firstDate) && Number.isFinite(secondDate)
      ? secondDate - firstDate
      : Number(second.year) - Number(first.year);
    if (!Number.isFinite(comparison) || comparison === 0) {
      comparison = String(second.createdAt || '').localeCompare(String(first.createdAt || ''));
    }
    return sortOrder === 'oldest' ? -comparison : comparison;
  });
  const activeFilterCount = Number(Boolean(department))
    + Number(Boolean(semester))
    + Number(Boolean(examType))
    + Number(Boolean(year))
    + Number(favoritesOnly);

  function clearFilters() {
    setDepartment('');
    setSemester('');
    setExamType('');
    setYear('');
    setFavoritesOnly(false);
  }

  function clearSearchAndFilters() {
    setSearch('');
    clearFilters();
  }

  const activeFilters = [
    search.trim() ? { key: 'search', label: `Search: ${search.trim()}`, remove: () => setSearch('') } : null,
    department ? {
      key: 'department',
      label: departments.find((item) => item.id === department)?.name || 'Department',
      remove: () => setDepartment(''),
    } : null,
    semester ? { key: 'semester', label: `Semester ${semester}`, remove: () => setSemester('') } : null,
    examType ? { key: 'examType', label: examType, remove: () => setExamType('') } : null,
    year ? { key: 'year', label: `Year ${year}`, remove: () => setYear('') } : null,
    favoritesOnly ? { key: 'saved', label: 'Saved papers', remove: () => setFavoritesOnly(false) } : null,
  ].filter(Boolean);

  if (libraryLoading && !papers.length && !departments.length) {
    return <LoadingState label="Loading the question paper library…" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.discoverHeading}>
        <View style={styles.discoverHeadingCopy}>
          <Text style={styles.screenTitle}>Discover</Text>
          <Text style={styles.muted}>
            Search the library, or open Filters to browse by department, semester, exam, or year.
          </Text>
        </View>
        <View style={styles.discoverCount}>
          <Text style={styles.discoverCountValue}>{libraryLoading && !papers.length ? '…' : papers.length}</Text>
          <Text style={styles.discoverCountLabel}>papers</Text>
        </View>
      </View>
      <View style={styles.discoverSearchCard}>
        <Text style={styles.label}>Search the library</Text>
        <View style={styles.searchInputRow}>
          <Text style={styles.searchIcon} accessible={false}>⌕</Text>
          <TextInput
            accessibilityLabel="Search question papers"
            value={search}
            onChangeText={setSearch}
            placeholder="Subject, code, or keyword"
            placeholderTextColor="#718178"
            returnKeyType="search"
            style={styles.searchInput}
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setSearch('')}
              hitSlop={8}
              style={styles.searchClear}
            >
              <Text style={styles.searchClearText}>×</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.discoverHint}>Search by subject name, subject code, or a word in the description.</Text>
      </View>
      <View style={styles.discoverToolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersVisible }}
          onPress={() => setFiltersVisible((visible) => !visible)}
          style={({ pressed }) => [styles.filterToggle, pressed && styles.pressed]}
        >
          <Text style={styles.filterToggleText}>{filtersVisible ? 'Hide filters' : 'Filters'}</Text>
          {activeFilterCount ? (
            <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View>
          ) : null}
          <Text style={styles.filterChevron}>{filtersVisible ? '−' : '+'}</Text>
        </Pressable>
        {user ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favoritesOnly ? 'Show all papers, currently showing saved papers' : 'Show saved papers'}
            accessibilityState={{ selected: favoritesOnly }}
            onPress={() => setFavoritesOnly((selected) => !selected)}
            style={[styles.savedShortcut, favoritesOnly && styles.savedShortcutSelected]}
          >
            <Text style={[styles.savedShortcutText, favoritesOnly && styles.savedShortcutTextSelected]}>
              {favoritesOnly ? '★ Saved' : '☆ Saved'}
            </Text>
          </Pressable>
        ) : null}
        {activeFilterCount || search.trim() ? (
          <Pressable onPress={clearSearchAndFilters} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>Clear all</Text>
          </Pressable>
        ) : null}
      </View>
      {filtersVisible ? (
        <View style={styles.filterPanel}>
          <Text style={styles.label}>Department</Text>
          <View style={styles.picker}>
            <Picker selectedValue={department} onValueChange={setDepartment}>
              <Picker.Item label="All departments" value="" />
              {departments.map((item) => (
                <Picker.Item key={item.id} label={`${item.name} (${item.code})`} value={item.id} />
              ))}
            </Picker>
          </View>
          <View style={[styles.filterRow, compact && styles.filterColumn]}>
            <View style={styles.filterHalf}>
              <Field label="Semester" value={semester} onChangeText={(value) => setSemester(value.replace(/\D/g, '').slice(0, 2))} placeholder="Any semester" keyboardType="number-pad" />
            </View>
            <View style={styles.filterHalf}>
              <Field label="Year" value={year} onChangeText={(value) => setYear(value.replace(/\D/g, '').slice(0, 4))} placeholder="Any year" keyboardType="number-pad" maxLength={4} />
            </View>
          </View>
          <Text style={styles.label}>Exam type</Text>
          <View style={styles.chips}>
            <Chip title="All" selected={!examType} onPress={() => setExamType('')} />
            {EXAM_TYPES.map((item) => (
              <Chip key={item} title={item} selected={examType === item} onPress={() => setExamType(examType === item ? '' : item)} />
            ))}
          </View>
        </View>
      ) : null}
      {activeFilters.length ? (
        <View style={styles.activeFilters} accessibilityLabel="Active search filters">
          {activeFilters.map((filter) => (
            <FilterChip key={filter.key} label={filter.label} onRemove={filter.remove} />
          ))}
        </View>
      ) : null}
      <View style={styles.discoverResultsHeading}>
        <View>
          <Text style={styles.sectionTitle}>
            {libraryLoading && !papers.length ? 'Loading papers…' : `${filtered.length} ${filtered.length === 1 ? 'paper' : 'papers'}`}
          </Text>
          <Text style={styles.discoverResultHint}>
            {search || activeFilterCount ? 'Matching your search and filters' : 'Recently available in the library'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh question papers"
          onPress={() => { clearNotice(); refresh(); }}
          style={styles.refreshButton}
        >
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </Pressable>
      </View>
      <LibraryStatus
        loading={libraryLoading}
        error={libraryError}
        onRetry={onRetryLibrary}
        hasData={papers.length > 0 || departments.length > 0}
      />
      <View style={styles.sortRow} accessibilityLabel="Sort question papers">
        <Text style={styles.sortLabel}>Sort:</Text>
        {[
          ['newest', 'Newest'],
          ['oldest', 'Oldest'],
          ['subject', 'Subject A–Z'],
        ].map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setSortOrder(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: sortOrder === value }}
            style={[styles.sortOption, sortOrder === value && styles.sortOptionSelected]}
          >
            <Text style={[styles.sortOptionText, sortOrder === value && styles.sortOptionTextSelected]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {sorted.map((paper) => (
        <PaperCard
          key={paper.id}
          paper={paper}
          favorite={favorites.includes(paper.id)}
          onFavorite={() => onFavorite(paper.id)}
          onOpen={() => openPaper(paper, refresh)}
          onDownload={() => downloadPaper(paper, refresh)}
          onShare={() => sharePaper(paper)}
        />
      ))}
      {!filtered.length && !libraryLoading && (!libraryError || papers.length > 0) ? (
        <View style={styles.discoverEmpty}>
          <Text style={styles.discoverEmptyIcon}>⌕</Text>
          <Text style={styles.cardTitle}>
            {favoritesOnly ? 'No saved papers yet' : papers.length ? 'No matching papers' : 'The library is getting started'}
          </Text>
          <Text style={styles.muted}>
            {favoritesOnly
              ? 'Save a question paper to find it here later.'
              : papers.length
              ? 'Try a different search or clear some filters to see more results.'
              : 'Question papers will appear here when they are added.'}
          </Text>
          {papers.length && (search || activeFilterCount) ? (
            <ActionButton title="Clear search and filters" secondary onPress={clearSearchAndFilters} />
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Chip({ title, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.selectedChip]}
    >
      <Text style={[styles.chipText, selected && styles.selectedChipText]}>{title}</Text>
    </Pressable>
  );
}

function FilterChip({ label, onRemove }) {
  return (
    <Pressable
      onPress={onRemove}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${label} filter`}
      style={styles.filterChip}
    >
      <Text style={styles.filterChipText} numberOfLines={1}>{label}</Text>
      <Text style={styles.filterChipRemove} accessible={false}>×</Text>
    </Pressable>
  );
}

function MockTestScreen({ papers, user, libraryLoading, libraryError, onRetryLibrary }) {
  const allPapersGroupKey = '__all_papers__';
  const [selectedPaperGroup, setSelectedPaperGroup] = useState('');
  const [selectedYears, setSelectedYears] = useState([]);
  const [questionCount, setQuestionCount] = useState('10');
  const [quiz, setQuiz] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const availablePapers = papers.filter((paper) => (
    paper.fileUrl
    && (!user.courseDepartmentId || paper.departmentId === user.courseDepartmentId)
  ));
  const paperGroups = [...new Map(
    availablePapers
      .map((paper) => {
        const key = JSON.stringify([
          paper.subject,
          paper.subjectCode || '',
          paper.departmentId || '',
          paper.semester || '',
        ]);
        return [key, {
          key,
          subject: paper.subject,
          subjectCode: paper.subjectCode,
          departmentId: paper.departmentId,
          departmentName: paper.departmentName,
          semester: paper.semester,
        }];
      }),
  ).values()].sort((first, second) => first.subject.localeCompare(second.subject));
  const selectedGroup = selectedPaperGroup === allPapersGroupKey
    ? { key: allPapersGroupKey, subject: 'All available subjects' }
    : paperGroups.find((group) => group.key === selectedPaperGroup);
  const papersForSelectedGroup = selectedGroup
    ? selectedPaperGroup === allPapersGroupKey
      ? availablePapers
      : availablePapers.filter((paper) => (
      paper.fileUrl
      && paper.subject === selectedGroup.subject
      && (paper.subjectCode || '') === (selectedGroup.subjectCode || '')
      && (paper.departmentId || '') === (selectedGroup.departmentId || '')
      && String(paper.semester || '') === String(selectedGroup.semester || '')
      ))
    : [];
  const availableYears = [...new Set(
    papersForSelectedGroup.map((paper) => String(paper.year).trim()).filter(Boolean),
  )].sort((first, second) => second.localeCompare(first));
  const selectedPaperIds = papersForSelectedGroup
    .filter((paper) => selectedYears.includes(String(paper.year).trim()))
    .map((paper) => paper.id);
  const count = Number(questionCount);

  function selectPaperGroup(groupKey) {
    setSelectedPaperGroup(groupKey);
    setSelectedYears([]);
    setError('');
  }

  function toggleYear(year) {
    setError('');
    setSelectedYears((selected) => {
      if (selected.includes(year)) return selected.filter((value) => value !== year);
      if (selected.length < 10) return [...selected, year];
      setError('Select up to 10 years per mock test.');
      return selected;
    });
  }

  async function startMockTest() {
    setGenerating(true);
    setError('');
    try {
      const result = await generateMockTest(selectedPaperIds, selectedYears, count);
      setQuiz(result);
      setAnswers({});
      setCurrentQuestion(0);
      setSubmitted(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setGenerating(false);
    }
  }

  function startAnotherTest() {
    setQuiz(null);
    setAnswers({});
    setCurrentQuestion(0);
    setSubmitted(false);
    setError('');
  }

  const question = quiz?.questions[currentQuestion];
  const score = quiz
    ? quiz.questions.reduce(
      (total, item, index) => total + (answers[index] === item.answerIndex ? 1 : 0),
      0,
    )
    : 0;

  if (libraryLoading && !papers.length) {
    return <LoadingState label="Loading papers for your practice test…" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.screenTitle}>AI mock test</Text>
      <Text style={styles.muted}>
        Choose one subject or all uploaded PDFs{user.courseDepartmentId ? ' for your course' : ''}. Only years with uploaded PDFs are selectable.
      </Text>
      <LibraryStatus
        loading={libraryLoading}
        error={libraryError}
        onRetry={onRetryLibrary}
        hasData={papers.length > 0}
      />
      {!quiz ? (
        <View style={styles.card}>
          <Text style={styles.label}>Paper name / subject</Text>
          {paperGroups.length ? (
            <View style={styles.picker}>
              <Picker selectedValue={selectedPaperGroup} onValueChange={selectPaperGroup}>
                <Picker.Item label="Choose a paper or subject" value="" />
                <Picker.Item
                  label={`${user.courseDepartmentId ? 'All papers in my course' : 'All available papers'} · ${availablePapers.length}`}
                  value={allPapersGroupKey}
                />
                {paperGroups.map((group) => (
                  <Picker.Item
                    key={group.key}
                    label={[
                      group.subject,
                      group.subjectCode,
                      group.departmentName,
                      group.semester ? `Semester ${group.semester}` : null,
                    ].filter(Boolean).join(' · ')}
                    value={group.key}
                  />
                ))}
              </Picker>
            </View>
          ) : (
            <Text style={styles.muted}>No uploaded PDF papers are available for your course yet.</Text>
          )}
          {selectedGroup ? (
            <>
              <Text style={styles.label}>Years available for this selection</Text>
              {availableYears.length ? (
                <View style={styles.chips}>
                  {availableYears.map((year) => (
                    <Chip
                      key={year}
                      title={year}
                      selected={selectedYears.includes(year)}
                      onPress={() => toggleYear(year)}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.muted}>No uploaded PDF years are available for this selection.</Text>
              )}
              <View style={styles.rowBetween}>
                <Text style={styles.homePreferenceFootnote}>Select one or more available years (up to 10).</Text>
                {availableYears.length > 0 && availableYears.length <= 10 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSelectedYears(
                      selectedYears.length === availableYears.length ? [] : availableYears,
                    )}
                  >
                    <Text style={styles.link}>
                      {selectedYears.length === availableYears.length ? 'Clear years' : 'Select all years'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {selectedPaperIds.length ? (
                <Text style={styles.homePreferenceFootnote}>
                  {selectedPaperIds.length} PDF{selectedPaperIds.length === 1 ? '' : 's'} selected
                </Text>
              ) : null}
              {selectedPaperIds.length > 500 ? (
                <Text style={styles.errorText}>
                  Select fewer years or choose one subject; a mock test can use up to 500 PDFs at a time.
                </Text>
              ) : null}
            </>
          ) : null}
          <Field
            label="Number of questions (1–30)"
            value={questionCount}
            onChangeText={(value) => setQuestionCount(value.replace(/\D/g, '').slice(0, 2))}
            placeholder="10"
            keyboardType="number-pad"
          />
          <View style={styles.mockSetupSummary} accessibilityLabel="Mock test setup summary">
            <Text style={styles.mockSetupTitle}>Your test</Text>
            <Text style={styles.mockSetupText}>
              Subject: {selectedGroup?.subject || 'Choose a subject'}
            </Text>
            <Text style={styles.mockSetupText}>
              Years: {selectedYears.length ? selectedYears.join(', ') : 'Choose one or more years'}
            </Text>
            <Text style={styles.mockSetupText}>
              Source PDFs: {selectedPaperIds.length} · Questions: {count >= 1 && count <= 30 ? count : 'Choose 1–30'}
            </Text>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <ActionButton
            title={generating ? 'Generating your test…' : 'Generate mock test'}
            onPress={startMockTest}
            disabled={generating || !selectedPaperIds.length || selectedPaperIds.length > 500 || !selectedYears.length || count < 1 || count > 30}
          />
          {generating ? (
            <View style={styles.mockGenerating} accessibilityLiveRegion="polite">
              <ActivityIndicator color={COLORS.forest} />
              <Text style={styles.muted}>
                Reading {selectedPaperIds.length} selected PDF{selectedPaperIds.length === 1 ? '' : 's'} and generating {count} questions. This can take a little while; keep the app open.
              </Text>
            </View>
          ) : null}
          <Text style={styles.homePreferenceFootnote}>
            Questions are generated only from the selected paper and years. Scanned PDFs are read using local OCR.
          </Text>
        </View>
      ) : submitted ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Test complete</Text>
            <Text style={styles.mockScore}>{score} / {quiz.questions.length} correct</Text>
            <Text style={styles.muted}>Papers used: {quiz.sourcePapers.map((paper) => `${paper.subject} (${paper.year})`).join(', ')}</Text>
            <ActionButton title="Create another test" onPress={startAnotherTest} />
          </View>
          {quiz.questions.map((item, index) => (
            <View key={`review-${index}`} style={styles.card}>
              <Text style={styles.mockQuestionTitle}>{index + 1}. {item.question}</Text>
              <Text style={answers[index] === item.answerIndex ? styles.mockCorrect : styles.mockIncorrect}>
                {answers[index] === item.answerIndex
                  ? 'Your answer was correct.'
                  : `Correct answer: ${item.options[item.answerIndex]}`}
              </Text>
              <Text style={styles.muted}>{item.explanation}</Text>
            </View>
          ))}
        </>
      ) : (
        <>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Question {currentQuestion + 1} of {quiz.questions.length}</Text>
            <Text style={styles.badge}>{quiz.years.join(', ')}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.mockQuestionTitle}>{currentQuestion + 1}. {question.question}</Text>
            {question.options.map((option, index) => {
              const selected = answers[currentQuestion] === index;
              return (
                <Pressable
                  key={`${currentQuestion}-${index}`}
                  onPress={() => setAnswers((current) => ({ ...current, [currentQuestion]: index }))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[styles.mockOption, selected && styles.mockOptionSelected]}
                >
                  <Text style={[styles.mockOptionText, selected && styles.mockOptionTextSelected]}>
                    {String.fromCharCode(65 + index)}. {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.rowBetween}>
            <ActionButton
              title="Previous"
              secondary
              onPress={() => setCurrentQuestion((index) => Math.max(0, index - 1))}
              disabled={currentQuestion === 0}
            />
            {currentQuestion === quiz.questions.length - 1 ? (
              <ActionButton title="Submit test" onPress={() => setSubmitted(true)} />
            ) : (
              <ActionButton
                title="Next"
                onPress={() => setCurrentQuestion((index) => Math.min(quiz.questions.length - 1, index + 1))}
              />
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const STUDY_RESOURCE_CATEGORIES = ['Assignment', 'Notes', 'Important information', 'Study guide'];

function StudyMaterialsScreen({ user }) {
  const [resources, setResources] = useState([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(STUDY_RESOURCE_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resourceError, setResourceError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const collegeName = user.role === 'user' ? user.collegeName : user.instituteName;

  const loadResources = useCallback(async () => {
    setLoading(true);
    setResourceError('');
    try {
      setResources(await request('/api/study-resources'));
    } catch (requestError) {
      setResourceError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  async function downloadResourceFile(resource) {
    if (!FileSystem.cacheDirectory) {
      throw new Error('The device does not have a temporary download folder available.');
    }
    const safeName = `${resource.title}-${Date.now()}`
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(0, 100);
    return downloadStudyResource(resource, `${FileSystem.cacheDirectory}${safeName}.pdf`);
  }

  useEffect(() => {
    loadResources();
  }, [loadResources, user.id]);

  async function submitResource() {
    setUploadSuccess('');
    if (!title.trim() || !file || !visibility) {
      setError('Enter a title, choose a PDF, and select who can access it.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await uploadStudyResource(file, {
        title: title.trim(),
        category,
        visibility,
        description: description.trim(),
      });
      setTitle('');
      setCategory(STUDY_RESOURCE_CATEGORIES[0]);
      setDescription('');
      setVisibility('');
      setFile(null);
      await loadResources();
      setUploadSuccess('Study material uploaded and shared successfully.');
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  }

  async function openResource(resource) {
    let temporaryFileUri;
    try {
      const download = await downloadResourceFile(resource);
      temporaryFileUri = download.uri;
      if (Platform.OS === 'android') {
        const contentUri = await FileSystem.getContentUriAsync(temporaryFileUri);
        try {
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            type: 'application/pdf',
            flags: ANDROID_GRANT_READ_URI_PERMISSION,
          });
        } catch (intentError) {
          if (intentError.code !== 'ERR_ACTIVITY_NOT_FOUND') throw intentError;
          if (!(await Sharing.isAvailableAsync())) {
            throw new Error('No PDF viewer is installed and the system share options are unavailable.');
          }
          await Sharing.shareAsync(temporaryFileUri, {
            mimeType: 'application/pdf',
            dialogTitle: `Open ${resource.title}`,
            UTI: 'com.adobe.pdf',
          });
        }
      } else {
        await Print.printAsync({ uri: temporaryFileUri });
      }
    } catch (openError) {
      Alert.alert(
        'Could not open study material',
        openError.message,
      );
    } finally {
      if (temporaryFileUri) await removeTemporaryDownload(temporaryFileUri);
    }
  }

  async function saveResource(resource) {
    let temporaryFileUri;
    try {
      let selectedDirectoryUri;
      if (Platform.OS === 'android') {
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        selectedDirectoryUri = permission.directoryUri;
      }

      const download = await downloadResourceFile(resource);
      temporaryFileUri = download.uri;
      if (selectedDirectoryUri) {
        const fileName = `${resource.title}-${Date.now()}`
          .replace(/[^A-Za-z0-9._-]/g, '_')
          .slice(0, 120);
        const destinationUri = await FileSystem.StorageAccessFramework.createFileAsync(
          selectedDirectoryUri,
          `${fileName}.pdf`,
          'application/pdf',
        );
        const contents = await FileSystem.readAsStringAsync(temporaryFileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.StorageAccessFramework.writeAsStringAsync(destinationUri, contents, {
          encoding: FileSystem.EncodingType.Base64,
        });
        Alert.alert('PDF downloaded', 'The PDF was saved to the folder you selected.');
      } else {
        if (!(await Sharing.isAvailableAsync())) {
          throw new Error('The system save options are unavailable on this device.');
        }
        await Sharing.shareAsync(temporaryFileUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Save ${resource.title}`,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (downloadError) {
      Alert.alert('Could not download study material', downloadError.message);
    } finally {
      if (temporaryFileUri) await removeTemporaryDownload(temporaryFileUri);
    }
  }

  async function shareResource(resource) {
    let temporaryFileUri;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Sharing is unavailable on this device.');
      }
      const download = await downloadResourceFile(resource);
      temporaryFileUri = download.uri;
      await Sharing.shareAsync(temporaryFileUri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share ${resource.title}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (shareError) {
      Alert.alert('Could not share study material', shareError.message);
    } finally {
      if (temporaryFileUri) await removeTemporaryDownload(temporaryFileUri);
    }
  }

  function deleteResource(resource) {
    Alert.alert('Delete study material?', `Remove "${resource.title}" from the shared library?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await request(`/api/study-resources/${resource.id}`, { method: 'DELETE' });
            setResources((current) => current.filter((item) => item.id !== resource.id));
          } catch (deleteError) {
            Alert.alert('Could not delete study material', deleteError.message);
          }
        },
      },
    ]);
  }

  if (loading && !resources.length) {
    return <LoadingState label="Loading study materials…" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.screenTitle}>Study materials</Text>
          <Text style={styles.muted}>Assignments, notes, important information, and study guides.</Text>
        </View>
        <Pressable onPress={loadResources} accessibilityRole="button">
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Share a study material</Text>
        <Text style={styles.muted}>Choose a clear title, identify the material, and decide who can view it.</Text>
        <Field
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Unit 1 revision notes"
          maxLength={200}
        />
        <Text style={styles.label}>Material type</Text>
        <View style={styles.picker}>
          <Picker selectedValue={category} onValueChange={setCategory}>
            {STUDY_RESOURCE_CATEGORIES.map((item) => (
              <Picker.Item key={item} label={item} value={item} />
            ))}
          </Picker>
        </View>
        <Field
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="Add useful details for other students"
          multiline
          maxLength={2000}
        />
        <Text style={styles.label}>Who can access this material?</Text>
        <View style={styles.chips}>
          <Chip
            title="Same college"
            selected={visibility === 'college'}
            onPress={() => setVisibility('college')}
          />
          <Chip
            title="Public to all students"
            selected={visibility === 'public'}
            onPress={() => setVisibility('public')}
          />
        </View>
        {visibility === 'college' ? (
          <Text style={styles.homePreferenceFootnote}>
            Only accounts registered with {collegeName || 'your college'} can access this PDF.
          </Text>
        ) : null}
        <DocumentUploadPicker file={file} onFileChange={setFile} disabled={busy} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {uploadSuccess ? (
          <Text style={styles.successText} accessibilityRole="alert">{uploadSuccess}</Text>
        ) : null}
        <ActionButton
          title={busy ? 'Uploading…' : 'Upload study material'}
          onPress={submitResource}
          disabled={busy || !title.trim() || !file || !visibility || (visibility === 'college' && !collegeName)}
        />
        {busy ? (
          <View style={styles.uploadStatus} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={COLORS.forest} />
            <Text style={styles.uploadStatusText}>Uploading your PDF. Keep Campus-notes open until it finishes.</Text>
          </View>
        ) : null}
        {!collegeName ? (
          <Text style={styles.homePreferenceFootnote}>
            Your account has no college name, so choose public access or update your institute details.
          </Text>
        ) : null}
      </View>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.sectionTitle}>Shared with you</Text>
          <Text style={styles.discoverResultHint}>Available to your college or shared publicly</Text>
        </View>
        <Text style={styles.badge}>{resources.length} items</Text>
      </View>
      {loading ? <LoadingState fullScreen={false} label="Updating study materials…" /> : null}
      {resourceError ? <Text style={styles.errorText}>{resourceError}</Text> : null}
      {!loading && !resourceError && !resources.length ? (
        <View style={styles.discoverEmpty}>
          <Text style={styles.discoverEmptyIcon}>▤</Text>
          <Text style={styles.cardTitle}>No shared materials yet</Text>
          <Text style={styles.muted}>Materials shared with your college or all students will appear here.</Text>
        </View>
      ) : null}
      {resources.map((resource) => (
        <View key={resource.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{resource.title}</Text>
            <Text style={styles.badge}>{resource.visibility === 'public' ? 'Public' : 'Same college'}</Text>
          </View>
          <Text style={styles.muted}>{resource.category} · Shared by {resource.uploadedByName}</Text>
          {resource.description ? <Text style={styles.description}>{resource.description}</Text> : null}
          <View style={styles.actions}>
            <ActionButton title="Open PDF" compact onPress={() => openResource(resource)} />
            <ActionButton title="Download PDF" compact secondary onPress={() => saveResource(resource)} />
            <ActionButton title="Share PDF" compact secondary onPress={() => shareResource(resource)} />
            {resource.uploadedBy === user.id ? (
              <ActionButton title="Delete" compact secondary onPress={() => deleteResource(resource)} />
            ) : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function LoginPanel({ onLogin, onRegister, loading, onPasswordFocus, departments }) {
  const [mode, setMode] = useState('choose');
  const [registrationStep, setRegistrationStep] = useState(1);
  const [name, setName] = useState('');
  const [readerCollege, setReaderCollege] = useState('');
  const [readerCourse, setReaderCourse] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginEmailError, setLoginEmailError] = useState('');
  const [loginPasswordError, setLoginPasswordError] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [accountType, setAccountType] = useState(null);
  const [instituteName, setInstituteName] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [supportingDocument, setSupportingDocument] = useState(null);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resetBusy, setResetBusy] = useState(false);
  const [registrationAttempted, setRegistrationAttempted] = useState(false);
  const isRegistering = mode === 'register';
  const isRequestingReset = mode === 'forgot';
  const isConfirmingReset = mode === 'reset';
  const isChoosingAccountType = mode === 'choose';
  const accountTypeLabel = accountType === 'institute' ? 'Institute staff' : 'Reader';
  const registrationErrors = registrationAttempted ? {
    name: !isRegistrationTextValid(name) ? 'Enter your full name.' : '',
    email: !email.trim()
      ? 'Enter your email address.'
      : !isEmailValid(email)
        ? 'Enter a valid email address.'
        : '',
    password: !password
      ? 'Enter a password.'
      : !isPasswordValid(password)
        ? PASSWORD_REQUIREMENTS
        : '',
    confirmPassword: !confirmPassword
      ? 'Confirm your password.'
      : password !== confirmPassword
        ? 'Passwords do not match.'
        : '',
    phone: accountType === 'institute' && !/^\d{10}$/.test(phone)
      ? 'Enter a 10-digit phone number.'
      : '',
    designation: accountType === 'institute' && !isRegistrationTextValid(designation)
      ? 'Enter your designation.'
      : '',
    instituteName: accountType === 'institute' && !isRegistrationTextValid(instituteName)
      ? 'Enter your college or university name.'
      : '',
    supportingDocument: accountType === 'institute' && !supportingDocument
      ? 'Upload your affiliation document.'
      : '',
    readerCollege: accountType === 'user' && !isRegistrationTextValid(readerCollege)
      ? 'Enter your college or university.'
      : '',
    readerCourse: accountType === 'user' && !readerCourse
      ? 'Choose your course or department.'
      : '',
  } : {};

  function chooseAccountType(type) {
    setAccountType(type);
    setRegistrationStep(1);
    setRegistrationAttempted(false);
    setMode('login');
  }

  function continueRegistration() {
    setRegistrationAttempted(true);
    const invalidProfile = !isRegistrationTextValid(name)
      || (accountType === 'institute'
        ? !/^\d{10}$/.test(phone)
          || !isRegistrationTextValid(designation)
          || !isRegistrationTextValid(instituteName)
          || !supportingDocument
        : !isRegistrationTextValid(readerCollege) || !readerCourse);
    if (invalidProfile) return;
    setRegistrationAttempted(false);
    setRegistrationStep(2);
  }

  async function chooseSupportingDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        const document = result.assets[0];
        const extension = document.name.split('.').pop()?.toLowerCase();
        if (!['pdf', 'jpg', 'jpeg', 'png'].includes(extension)) {
          Alert.alert('Unsupported document', 'Choose a PDF, JPG, or PNG supporting document.');
          return;
        }
        if (document.size !== undefined && document.size <= 0) {
          Alert.alert('Empty document', 'Choose a supporting document that is not empty.');
          return;
        }
        if (document.size !== undefined && document.size > 20 * 1024 * 1024) {
          Alert.alert('Document too large', 'The supporting document must be 20 MB or smaller.');
          return;
        }
        setSupportingDocument(document);
      }
    } catch (error) {
      Alert.alert('Could not open documents', error.message);
    }
  }

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  if (mode === 'submitted') {
    return (
      <View style={styles.card}>
        <View style={styles.homePreferenceIcon}>
          <Text style={styles.homePreferenceIconText}>✓</Text>
        </View>
        <Text style={styles.cardTitle}>Application sent for verification</Text>
        <Text style={styles.muted}>
          Your account has been submitted to the admin and is waiting for approval.
          Once the admin approves it, you will receive an email confirming your account has been approved at {email.trim()}.
        </Text>
        <ActionButton title="Back to sign in" onPress={() => setMode('login')} />
      </View>
    );
  }

  async function sendResetCode() {
    setResetBusy(true);
    try {
      const result = await requestPasswordReset(email.trim());
      setResendSeconds(result.resendAfterSeconds || 60);
      setMode('reset');
      Alert.alert('Check your email', result.message);
    } catch (error) {
      Alert.alert('Could not send reset code', error.message);
    } finally {
      setResetBusy(false);
    }
  }

  async function resetPassword() {
    setResetBusy(true);
    try {
      const result = await confirmPasswordReset(email.trim(), otp, newPassword);
      setMode('login');
      setPassword('');
      setNewPassword('');
      setOtp('');
      Alert.alert('Password updated', result.message);
    } catch (error) {
      Alert.alert('Could not reset password', error.message);
    } finally {
      setResetBusy(false);
    }
  }

  async function submitLogin() {
    const normalizedEmail = email.trim();
    const emailError = !normalizedEmail
      ? 'Email is required.'
      : !isEmailValid(normalizedEmail)
        ? 'Enter a valid email address.'
        : '';
    const passwordError = password ? '' : 'Password is required.';
    setLoginEmailError(emailError);
    setLoginPasswordError(passwordError);
    if (emailError || passwordError) return;

    try {
      await onLogin(normalizedEmail, password, accountType);
    } catch (error) {
      if (error.message.startsWith('This email is registered as ')) {
        setLoginEmailError(error.message);
      } else if (error.message === 'Invalid email or password') {
        setLoginPasswordError('Email or password is incorrect.');
      } else {
        setLoginPasswordError(error.message);
      }
    }
  }

  return (
    <View style={styles.card}>
      {isChoosingAccountType ? (
        <>
          <Text style={styles.cardTitle}>Choose your account type</Text>
          <Text style={styles.muted}>Select the account you want to sign in to or create.</Text>
          <ActionButton title="Reader" onPress={() => chooseAccountType('user')} />
          <Text style={styles.muted}>Browse papers and save favorites.</Text>
          <ActionButton title="Institute staff" secondary onPress={() => chooseAccountType('institute')} />
          <Text style={styles.muted}>Request access to upload and manage institute papers.</Text>
        </>
      ) : null}
      {!isChoosingAccountType ? (
        <>
      <Text style={styles.cardTitle}>
        {isRegistering
          ? `Create ${accountTypeLabel.toLowerCase()} account`
          : isRequestingReset
            ? 'Forgot password'
            : isConfirmingReset
              ? 'Reset password'
              : `${accountTypeLabel} sign in`}
      </Text>
      <Text style={styles.muted}>
        {isRegistering
          ? accountType === 'institute'
            ? 'Create an institute staff account. Uploading and editing become available after an administrator approves your account.'
            : 'Create a reader account to browse papers and save favorites.'
          : isRequestingReset || isConfirmingReset
            ? 'Password reset is available for reader, institute, and administrator accounts.'
            : accountType === 'institute'
              ? 'Sign in to check your institute approval status and manage papers when approved.'
              : 'Sign in to browse papers and manage your saved favorites.'}
      </Text>
      {isRegistering ? (
        <View style={styles.registrationProgress} accessibilityLabel={`Registration step ${registrationStep} of 2`}>
          <Text style={styles.registrationProgressText}>
            Step {registrationStep} of 2 · {registrationStep === 1 ? 'Your details' : 'Sign-in details'}
          </Text>
          <View style={styles.registrationProgressTrack}>
            <View style={[
              styles.registrationProgressFill,
              registrationStep === 2 && styles.registrationProgressComplete,
            ]} />
          </View>
          <Text style={styles.passwordHint}>
            {registrationStep === 1
              ? accountType === 'institute'
                ? 'Your affiliation document is only used to verify your institute account before approval.'
                : 'Your college and course help us recommend relevant question papers.'
              : 'Your email is used to sign in and recover your account.'}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={loading || resetBusy}
        onPress={() => setMode('choose')}
        style={styles.authSwitch}
      >
        <Text style={styles.link}>Change account type · {accountTypeLabel}</Text>
      </Pressable>
      {isRequestingReset || isConfirmingReset ? (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          {isConfirmingReset ? (
            <>
              <Field label="Email code" value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" keyboardType="number-pad" />
              <Field
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Create a strong password"
                secureTextEntry
                showPasswordToggle
                passwordVisible={newPasswordVisible}
                onFocus={onPasswordFocus}
                onTogglePasswordVisibility={() => setNewPasswordVisible((visible) => !visible)}
              />
              <Text style={styles.passwordHint}>{PASSWORD_REQUIREMENTS}</Text>
              <ActionButton
                title={resetBusy ? 'Updating password…' : 'Update password'}
                onPress={resetPassword}
                disabled={resetBusy || otp.length !== 6 || !isPasswordValid(newPassword) || !email.trim()}
              />
              <ActionButton
                title={resendSeconds ? `Resend code in ${resendSeconds}s` : (resetBusy ? 'Sending…' : 'Resend code')}
                onPress={sendResetCode}
                disabled={resetBusy || resendSeconds > 0 || !email.trim()}
                secondary
              />
            </>
          ) : (
            <ActionButton
              title={resetBusy ? 'Sending code…' : 'Send reset code'}
              onPress={sendResetCode}
              disabled={resetBusy || !email.trim()}
            />
          )}
          <Pressable disabled={resetBusy} onPress={() => setMode('login')} style={styles.authSwitch}>
            <Text style={styles.link}>Back to sign in</Text>
          </Pressable>
        </>
      ) : null}
      {!isRequestingReset && !isConfirmingReset ? (
        <>
          {isRegistering ? (
            <>
              <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" maxLength={160} />
              {registrationErrors.name ? <Text style={styles.errorText}>{registrationErrors.name}</Text> : null}
              {name.length > 0 && !isRegistrationTextValid(name) ? (
                <Text style={styles.errorText}>Enter a name with at least 2 letters or numbers.</Text>
              ) : null}
            </>
          ) : null}
          {isRegistering ? (
            <>
              {accountType === 'institute' ? (
                <>
                  <Field
                    label="Phone number"
                    value={phone}
                    onChangeText={(value) => setPhone(value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit phone number"
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                  {registrationErrors.phone ? <Text style={styles.errorText}>{registrationErrors.phone}</Text> : null}
                  {phone.length > 0 && phone.length !== 10 ? (
                    <Text style={styles.errorText}>Phone number must contain exactly 10 digits.</Text>
                  ) : null}
                  <Field
                    label="Designation"
                    value={designation}
                    onChangeText={setDesignation}
                    placeholder="e.g. Lecturer"
                    maxLength={120}
                  />
                  {registrationErrors.designation ? <Text style={styles.errorText}>{registrationErrors.designation}</Text> : null}
                  {designation.length > 0 && !isRegistrationTextValid(designation) ? (
                    <Text style={styles.errorText}>Enter a valid designation (at least 2 characters).</Text>
                  ) : null}
                  <Field
                    label="College / university name"
                    value={instituteName}
                    onChangeText={setInstituteName}
                    placeholder="Your college or university"
                    maxLength={200}
                  />
                  {registrationErrors.instituteName ? <Text style={styles.errorText}>{registrationErrors.instituteName}</Text> : null}
                  {instituteName.length > 0 && !isRegistrationTextValid(instituteName) ? (
                    <Text style={styles.errorText}>Enter a valid college or university name (at least 2 characters).</Text>
                  ) : null}
                  <ActionButton
                    title={supportingDocument?.name || 'Upload supporting document'}
                    secondary
                    onPress={chooseSupportingDocument}
                  />
                  {registrationErrors.supportingDocument ? (
                    <Text style={styles.errorText}>{registrationErrors.supportingDocument}</Text>
                  ) : null}
                  <Text style={styles.passwordHint}>Upload a non-empty affiliation document as PDF, JPG, or PNG (up to 20 MB).</Text>
                </>
              ) : (
                <>
                  <Field
                    label="College / university"
                    value={readerCollege}
                    onChangeText={setReaderCollege}
                    placeholder="Your college or university"
                    maxLength={200}
                  />
                  {registrationErrors.readerCollege ? <Text style={styles.errorText}>{registrationErrors.readerCollege}</Text> : null}
                  <Text style={styles.label}>Course / department</Text>
                  <View style={styles.picker}>
                    <Picker selectedValue={readerCourse} onValueChange={setReaderCourse}>
                      <Picker.Item label="Choose your course" value="" />
                      {departments.map((department) => (
                        <Picker.Item
                          key={department.id}
                          label={`${department.name} (${department.code})`}
                          value={department.id}
                        />
                      ))}
                    </Picker>
                  </View>
                  {registrationErrors.readerCourse ? <Text style={styles.errorText}>{registrationErrors.readerCourse}</Text> : null}
                </>
              )}
            </>
          ) : null}
          {!isRegistering || registrationStep === 2 ? (
          <>
          <Field
            label="Email"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setLoginEmailError('');
            }}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            maxLength={isRegistering ? 254 : undefined}
          />
          {!isRegistering && loginEmailError ? (
            <Text style={styles.errorText}>{loginEmailError}</Text>
          ) : null}
          {registrationErrors.email ? <Text style={styles.errorText}>{registrationErrors.email}</Text> : null}
          {isRegistering && email.length > 0 && !isEmailValid(email) ? (
            <Text style={styles.errorText}>Enter a valid email address.</Text>
          ) : null}
          <Field
            label="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setLoginPasswordError('');
            }}
            placeholder={isRegistering ? 'Create a strong password' : 'Password'}
            secureTextEntry
            showPasswordToggle
            passwordVisible={passwordVisible}
            onFocus={onPasswordFocus}
            onTogglePasswordVisibility={() => setPasswordVisible((visible) => !visible)}
          />
          {!isRegistering && loginPasswordError ? (
            <Text style={styles.errorText}>{loginPasswordError}</Text>
          ) : null}
          {registrationErrors.password ? <Text style={styles.errorText}>{registrationErrors.password}</Text> : null}
          {isRegistering ? <Text style={styles.passwordHint}>{PASSWORD_REQUIREMENTS}</Text> : null}
          {isRegistering ? (
            <>
              <Field
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Enter password again"
                secureTextEntry
                showPasswordToggle
                passwordVisible={confirmPasswordVisible}
                onFocus={onPasswordFocus}
                onTogglePasswordVisibility={() => setConfirmPasswordVisible((visible) => !visible)}
              />
              {registrationErrors.confirmPassword ? (
                <Text style={styles.errorText}>{registrationErrors.confirmPassword}</Text>
              ) : null}
              {confirmPassword && password !== confirmPassword ? (
                <Text style={styles.errorText}>Passwords do not match.</Text>
              ) : null}
            </>
          ) : null}
          </>
          ) : null}
          {isRegistering && registrationStep === 1 ? (
            <ActionButton
              title="Continue to sign-in details"
              onPress={continueRegistration}
              disabled={loading}
            />
          ) : null}
          {isRegistering && registrationStep === 2 ? (
            <ActionButton
              title="Back to your details"
              secondary
              onPress={() => {
                setRegistrationAttempted(false);
                setRegistrationStep(1);
              }}
              disabled={loading}
            />
          ) : null}
          {!isRegistering || registrationStep === 2 ? (
          <ActionButton
            title={isRegistering ? (loading ? 'Creating account…' : 'Create account') : (loading ? 'Signing in…' : 'Sign in')}
            onPress={async () => {
              if (!isRegistering) {
                submitLogin();
                return;
              }
              setRegistrationAttempted(true);
              if (Object.values({
                name: !isRegistrationTextValid(name),
                email: !isEmailValid(email),
                password: !isPasswordValid(password),
                confirmPassword: password !== confirmPassword || !confirmPassword,
                phone: accountType === 'institute' && !/^\d{10}$/.test(phone),
                designation: accountType === 'institute' && !isRegistrationTextValid(designation),
                instituteName: accountType === 'institute' && !isRegistrationTextValid(instituteName),
                supportingDocument: accountType === 'institute' && !supportingDocument,
                readerCollege: accountType === 'user' && !isRegistrationTextValid(readerCollege),
                readerCourse: accountType === 'user' && !readerCourse,
              }).some(Boolean)) return;
              const registered = await onRegister(name.trim(), email.trim(), password, accountType, instituteName.trim(), {
                phone: phone.trim(),
                designation: designation.trim(),
                supportingDocument,
              }, {
                collegeName: readerCollege.trim(),
                courseDepartmentId: readerCourse,
              });
              if (registered && accountType === 'institute') setMode('submitted');
            }}
            disabled={loading}
          />
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={() => {
              setRegistrationAttempted(false);
              setRegistrationStep(1);
              setMode(isRegistering ? 'login' : 'register');
            }}
            style={styles.authSwitch}
          >
            <Text style={styles.link}>
              {isRegistering ? 'Already have an account? Sign in' : 'New to Campus-notes? Create an account'}
            </Text>
          </Pressable>
          {!isRegistering ? (
            <Pressable accessibilityRole="button" disabled={loading} onPress={() => setMode('forgot')} style={styles.authSwitch}>
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
        </>
      ) : null}
    </View>
  );
}

function InstitutePublishing({
  departments, papers, refresh, onDepartmentCreated, libraryLoading, libraryError, onRetryLibrary,
}) {
  const [editing, setEditing] = useState(null);
  const [subject, setSubject] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [addingDepartment, setAddingDepartment] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentCode, setNewDepartmentCode] = useState('');
  const [departmentBusy, setDepartmentBusy] = useState(false);
  const [semester, setSemester] = useState('1');
  const [examType, setExamType] = useState(EXAM_TYPES[0]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deletingPaperId, setDeletingPaperId] = useState(null);
  const [formError, setFormError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  useEffect(() => {
    if (editing) {
      setSubject(editing.subject);
      setSubjectCode(editing.subjectCode || '');
      setDepartmentId(editing.departmentId);
      setSemester(String(editing.semester));
      setExamType(editing.examType);
      setYear(String(editing.year));
      setDescription(editing.description || '');
      setFile(null);
    } else if (!departmentId && departments.length) {
      setDepartmentId(departments[0].id);
    }
  }, [editing, departments]);

  function clearForm() {
    setEditing(null);
    setSubject('');
    setSubjectCode('');
    setSemester('1');
    setExamType(EXAM_TYPES[0]);
    setYear(String(new Date().getFullYear()));
    setDescription('');
    setFile(null);
    setFormError('');
    setSaveSuccess('');
  }

  async function createDepartment() {
    if (!newDepartmentName.trim() || !newDepartmentCode.trim()) {
      Alert.alert('Missing information', 'Enter both a department name and code.');
      return;
    }
    setDepartmentBusy(true);
    try {
      const department = await request('/api/departments', {
        method: 'POST',
        body: JSON.stringify({
          name: newDepartmentName.trim(),
          code: newDepartmentCode.trim().toUpperCase(),
        }),
      });
      onDepartmentCreated(department);
      setDepartmentId(department.id);
      setNewDepartmentName('');
      setNewDepartmentCode('');
      setAddingDepartment(false);
    } catch (error) {
      Alert.alert('Could not add department', error.message);
    } finally {
      setDepartmentBusy(false);
    }
  }

  async function savePaper() {
    if (!subject.trim() || !departmentId || (!editing && !file)) {
      setFormError('Enter the subject, choose a department, and select a PDF.');
      return;
    }
    setBusy(true);
    setFormError('');
    setSaveSuccess('');
    try {
      const uploaded = file ? await uploadPdf(file) : null;
      const payload = {
        subject: subject.trim(),
        subject_code: subjectCode.trim() || null,
        department_id: departmentId,
        semester: Number(semester),
        exam_type: examType,
        year,
        description: description.trim() || null,
        ...(uploaded ? { file_url: uploaded.url } : {}),
      };
      await request(editing ? `/api/papers/${editing.id}` : '/api/papers', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      clearForm();
      refresh();
      setSaveSuccess(editing ? 'Question paper updated successfully.' : 'Question paper uploaded successfully.');
    } catch (error) {
      setFormError(`Could not save paper: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function confirmDeletePaper(paper) {
    Alert.alert(
      'Delete question paper?',
      `“${paper.subject}” will be permanently removed from the library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingPaperId(paper.id);
            try {
              await request(`/api/papers/${paper.id}`, { method: 'DELETE' });
              if (editing?.id === paper.id) clearForm();
              refresh();
            } catch (error) {
              Alert.alert('Could not delete paper', error.message);
            } finally {
              setDeletingPaperId(null);
            }
          },
        },
      ],
    );
  }

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{editing ? 'Edit question paper' : 'Upload question paper'}</Text>
        <Field
          label="Subject"
          value={subject}
          onChangeText={(value) => { setSubject(value); setFormError(''); setSaveSuccess(''); }}
        />
        <Field
          label="Subject code (optional)"
          value={subjectCode}
          onChangeText={(value) => { setSubjectCode(value); setFormError(''); setSaveSuccess(''); }}
        />
        <Text style={styles.label}>Department</Text>
        <View style={styles.picker}>
          <Picker selectedValue={departmentId} onValueChange={(value) => { setDepartmentId(value); setFormError(''); setSaveSuccess(''); }}>
            {!departments.length ? <Picker.Item label="Add a department to continue" value="" /> : null}
            {departments.map((item) => <Picker.Item key={item.id} label={item.name} value={item.id} />)}
          </Picker>
        </View>
        {!editing ? (
          <>
            <ActionButton
              title={addingDepartment ? 'Cancel adding department' : '+ Add a department'}
              secondary
              onPress={() => setAddingDepartment((visible) => !visible)}
            />
            {addingDepartment ? (
              <View style={styles.inlineDepartmentForm}>
                <Text style={styles.label}>New department</Text>
                <Field
                  label="Department name"
                  value={newDepartmentName}
                  onChangeText={setNewDepartmentName}
                  placeholder="e.g. Computer Science"
                  maxLength={160}
                />
                <Field
                  label="Department code"
                  value={newDepartmentCode}
                  onChangeText={(value) => setNewDepartmentCode(value.toUpperCase())}
                  placeholder="e.g. CSE"
                  maxLength={32}
                  autoCapitalize="characters"
                />
                <ActionButton
                  title={departmentBusy ? 'Adding department…' : 'Add department'}
                  onPress={createDepartment}
                  disabled={departmentBusy || !newDepartmentName.trim() || !newDepartmentCode.trim()}
                />
              </View>
            ) : null}
          </>
        ) : null}
        <Field label="Semester" value={semester} onChangeText={(value) => { setSemester(value.replace(/\D/g, '').slice(0, 2)); setFormError(''); setSaveSuccess(''); }} keyboardType="number-pad" />
        <Text style={styles.label}>Exam type</Text>
        <View style={styles.picker}>
          <Picker selectedValue={examType} onValueChange={setExamType}>
            {EXAM_TYPES.map((item) => <Picker.Item key={item} label={item} value={item} />)}
          </Picker>
        </View>
        <Field label="Year" value={year} onChangeText={(value) => { setYear(value); setFormError(''); setSaveSuccess(''); }} keyboardType="number-pad" />
        <Field label="Description (optional)" value={description} onChangeText={(value) => { setDescription(value); setFormError(''); setSaveSuccess(''); }} multiline />
        <DocumentUploadPicker
          file={file}
          onFileChange={(selectedFile) => { setFile(selectedFile); setFormError(''); setSaveSuccess(''); }}
          disabled={busy}
        />
        {formError ? <Text style={styles.errorText} accessibilityRole="alert">{formError}</Text> : null}
        {saveSuccess ? <Text style={styles.successText} accessibilityRole="alert">{saveSuccess}</Text> : null}
        <View style={styles.actions}>
          <ActionButton
            title={busy ? 'Saving…' : editing ? 'Save changes' : 'Upload paper'}
            onPress={savePaper}
            disabled={busy || !subject.trim() || !departmentId || (!editing && !file)}
          />
          {editing ? <ActionButton title="Cancel" secondary onPress={clearForm} /> : null}
        </View>
        {busy ? (
          <View style={styles.uploadStatus} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={COLORS.forest} />
            <Text style={styles.uploadStatusText}>
              {file ? 'Uploading your PDF and saving paper details…' : 'Saving your paper details…'}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.sectionTitle}>Your uploaded question papers</Text>
      <LibraryStatus
        loading={libraryLoading}
        error={libraryError}
        onRetry={onRetryLibrary}
        hasData={papers.length > 0}
      />
      {papers.map((paper) => (
        <View key={paper.id} style={styles.card}>
          <Text style={styles.cardTitle}>{paper.subject}</Text>
          <Text style={styles.muted}>
            {paper.departmentName || 'Department'} · Semester {paper.semester} · {paper.examType} · {paper.year}
          </Text>
          <ActionButton
            title="Edit paper"
            compact
            secondary
            disabled={Boolean(deletingPaperId)}
            onPress={() => {
              setFormError('');
              setSaveSuccess('');
              setEditing(paper);
            }}
          />
          <ActionButton
            title={deletingPaperId === paper.id ? 'Deleting…' : 'Delete paper'}
            compact
            destructive
            disabled={Boolean(deletingPaperId)}
            onPress={() => confirmDeletePaper(paper)}
          />
        </View>
      ))}
      {!papers.length && !libraryLoading && !libraryError ? (
        <EmptyState text="You have not uploaded any question papers yet." />
      ) : null}
    </>
  );
}

function EditProfileForm({ user, onUpdated, onCancel, onPasswordFocus }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [instituteName, setInstituteName] = useState(user.instituteName || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [designation, setDesignation] = useState(user.designation || '');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const updated = await request(`/api/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          ...(user.role === 'institute' ? {
            institute_name: instituteName.trim(),
            phone: phone.trim(),
            designation: designation.trim(),
          } : {}),
          ...(password ? { password } : {}),
        }),
      });
      setPassword('');
      onUpdated(updated);
      Alert.alert('Profile updated', 'Your account details have been saved.');
    } catch (error) {
      Alert.alert('Could not update profile', error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{user.role === 'institute' ? 'Edit institute details' : 'Edit profile'}</Text>
      <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field
        label="Email address"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      {user.role === 'institute' ? (
        <>
          <Field label="Institute name" value={instituteName} onChangeText={setInstituteName} />
          <Field
            label="Phone number"
            value={phone}
            onChangeText={(value) => setPhone(value.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            maxLength={10}
          />
          <Field label="Designation" value={designation} onChangeText={setDesignation} />
        </>
      ) : null}
      <Field
        label="New password (optional)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Create a strong password"
        showPasswordToggle
        passwordVisible={passwordVisible}
        onFocus={onPasswordFocus}
        onTogglePasswordVisibility={() => setPasswordVisible((visible) => !visible)}
      />
      {password ? <Text style={styles.passwordHint}>{PASSWORD_REQUIREMENTS}</Text> : null}
      <ActionButton
        title={busy ? 'Saving…' : 'Save changes'}
        onPress={save}
        disabled={
          busy
          || !isRegistrationTextValid(name)
          || !isEmailValid(email)
          || (user.role === 'institute' && (
            !isRegistrationTextValid(instituteName)
            || !/^\d{10}$/.test(phone)
            || !isRegistrationTextValid(designation)
          ))
          || (password.length > 0 && !isPasswordValid(password))
        }
      />
      <ActionButton title="Cancel" secondary onPress={onCancel} disabled={busy} />
    </View>
  );
}

function AccountScreen({
  user, loading, sessionLoading, onLogin, onRegister, onLogout, onAccountRefreshed, onDepartmentCreated,
  departments, papers, refresh, libraryLoading, libraryError, onRetryLibrary,
}) {
  const [editingProfile, setEditingProfile] = useState(false);
  const scrollRef = useRef(null);

  function scrollToFocusedInput(input) {
    setTimeout(() => {
      input?.measureLayout(
        scrollRef.current,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true }),
        () => {},
      );
    }, 200);
  }

  async function refreshAccountStatus() {
    try {
      onAccountRefreshed((await request('/api/auth/me')).user);
    } catch (error) {
      Alert.alert('Could not refresh account status', error.message);
    }
  }

  if (sessionLoading) {
    return <LoadingState label="Loading your account…" />;
  }

  if (!user) {
    return (
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          automaticallyAdjustKeyboardInsets
        >
          <Text style={styles.screenTitle}>Your account</Text>
          <LoginPanel
            onLogin={onLogin}
            onRegister={onRegister}
            loading={loading}
            onPasswordFocus={scrollToFocusedInput}
            departments={departments}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="none"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.screenTitle}>Your account</Text>
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>{user.name.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.profileIdentity}>
          <Text style={styles.cardTitle}>{user.name}</Text>
          <Text style={styles.muted}>{user.email}</Text>
          <Text style={styles.profileRole}>{user.role === 'institute' ? 'Institute staff' : 'Reader account'}</Text>
        </View>
        {user.role === 'institute' ? (
          <View style={[
            styles.approvalBadge,
            user.approvalStatus === 'approved' ? styles.approvalBadgeApproved : null,
            user.approvalStatus === 'rejected' ? styles.approvalBadgeRejected : null,
          ]}>
            <Text style={styles.approvalBadgeText}>
              {user.approvalStatus === 'approved' ? 'Approved' : user.approvalStatus === 'rejected' ? 'Not approved' : 'Pending review'}
            </Text>
          </View>
        ) : null}
        {user.role === 'institute' ? (
          <View style={styles.profileDetails}>
            <Text style={styles.profileDetailText}>{user.instituteName}</Text>
            <Text style={styles.profileDetailText}>{[user.designation, user.phone].filter(Boolean).join(' · ')}</Text>
          </View>
        ) : (
          <View style={styles.profileDetails}>
            {user.collegeName ? <Text style={styles.profileDetailText}>{user.collegeName}</Text> : null}
            {user.courseDepartmentId ? (
              <Text style={styles.profileDetailText}>
                {departments.find((item) => item.id === user.courseDepartmentId)?.name || 'Course selected'}
              </Text>
            ) : null}
          </View>
        )}
        {user.role === 'institute' || user.role === 'user' ? (
          <ActionButton
            title={user.role === 'institute' ? 'Edit institute details' : 'Edit profile'}
            secondary
            onPress={() => setEditingProfile((editing) => !editing)}
          />
        ) : null}
        <ActionButton title="Sign out" secondary destructive onPress={onLogout} />
      </View>
      {editingProfile && (user.role === 'institute' || user.role === 'user') ? (
        <EditProfileForm
          user={user}
          onPasswordFocus={scrollToFocusedInput}
          onUpdated={(updated) => {
            onAccountRefreshed(updated);
            setEditingProfile(false);
          }}
          onCancel={() => setEditingProfile(false)}
        />
      ) : null}
      {user.role === 'institute' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{user.instituteName}</Text>
            {user.approvalStatus === 'pending' ? (
              <>
                <Text style={styles.muted}>Your institute account is waiting for system admin approval. You can browse papers, but uploading and editing are unavailable until approved.</Text>
                <ActionButton title="Check approval status" secondary onPress={refreshAccountStatus} />
              </>
            ) : user.approvalStatus === 'approved' ? (
              <Text style={styles.muted}>Your institute account is approved. You can upload and edit question papers across departments.</Text>
            ) : (
              <>
                <Text style={styles.muted}>Your institute account was not approved. You can still browse papers, but uploading and editing are unavailable.</Text>
                {user.rejectionReason ? (
                  <View style={styles.rejectionNotice}>
                    <Text style={styles.rejectionNoticeTitle}>Admin’s reason</Text>
                    <Text style={styles.rejectionNoticeText}>{user.rejectionReason}</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
          {user.approvalStatus === 'approved' ? (
            <InstitutePublishing
              departments={departments}
              papers={papers.filter((paper) => paper.uploadedBy === user.id)}
              refresh={refresh}
              onDepartmentCreated={onDepartmentCreated}
              libraryLoading={libraryLoading}
              libraryError={libraryError}
              onRetryLibrary={onRetryLibrary}
            />
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your reading account</Text>
            <Text style={styles.muted}>Browse papers and tap the star to save your favorites to your account.</Text>
          </View>
        </>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function EmptyState({ text }) {
  return <View style={styles.empty}><Text style={styles.muted}>{text}</Text></View>;
}

function LaunchSplash() {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: DESIGN_TOKENS.motion.splash,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance]);

  return (
    <View style={styles.launchSplash}>
      <Animated.View
        style={[
          styles.launchSplashContent,
          {
            opacity: entrance,
            transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        <Image source={require('./notes-logo.png')} style={styles.launchSplashLogo} resizeMode="contain" />
        <Text style={styles.launchSplashTitle}>NAGALAND</Text>
        <Text style={styles.launchSplashSubtitle}>CAMPUS NOTES</Text>
        <Text style={styles.launchSplashTagline}>Learn  ·  Share  ·  Grow</Text>
      </Animated.View>
    </View>
  );
}

function WelcomeScreen({ onGetStarted }) {
  return (
    <View style={styles.welcomeScreen}>
      <View style={styles.welcomeSky} />
      <View style={styles.welcomeHillBack} />
      <View style={styles.welcomeHillMiddle} />
      <View style={styles.welcomeHillFront} />
      <View style={styles.welcomeContent}>
        <View style={styles.welcomeLogoFrame}>
          <Image source={require('./notes-logo.png')} style={styles.welcomeLogo} resizeMode="contain" />
        </View>
        <Text style={styles.welcomeTagline}>Learn  ·  Share  ·  Grow</Text>
      </View>
      <View style={styles.welcomeFooter}>
        <Pressable
          onPress={onGetStarted}
          accessibilityRole="button"
          style={({ pressed }) => [styles.welcomeButton, pressed && styles.pressed]}
        >
          <Text style={styles.welcomeButtonText}>Get Started</Text>
        </Pressable>
        <View style={styles.welcomeDots} accessibilityLabel="Welcome screen, page 1 of 3">
          <View style={styles.welcomeDotActive} />
          <View style={styles.welcomeDot} />
          <View style={styles.welcomeDot} />
        </View>
      </View>
    </View>
  );
}

async function openPaper(paper, refresh) {
  try {
    if (!paper.fileUrl) {
      Alert.alert('PDF unavailable', 'This paper does not have a PDF attached.');
      return;
    }
    await request(`/api/papers/${paper.id}/views`, { method: 'POST' });
    await Linking.openURL(paper.fileUrl);
    refresh();
  } catch (error) {
    Alert.alert('Could not open paper', error.message);
  }
}

async function downloadPaperFile(paper) {
  if (!paper.fileUrl) {
    throw new Error('This paper does not have a PDF attached.');
  }
  if (!FileSystem.documentDirectory) {
    throw new Error('The device does not have a document folder available.');
  }

  if (!FileSystem.cacheDirectory) {
    throw new Error('The device does not have a temporary download folder available.');
  }

  const safeName = `${paper.subject}-${paper.year}`
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 100);
  const destination = `${FileSystem.cacheDirectory}${safeName}-${Date.now()}.pdf`;
  const download = await FileSystem.downloadAsync(paper.fileUrl, destination);
  if (download.status < 200 || download.status >= 300) {
    throw new Error(`The server returned status ${download.status}.`);
  }
  return download.uri;
}

async function downloadPaper(paper, refresh) {
  let temporaryFileUri;
  try {
    let selectedDirectoryUri;
    if (Platform.OS === 'android') {
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) return;
      selectedDirectoryUri = permission.directoryUri;
    }

    temporaryFileUri = await downloadPaperFile(paper);
    if (selectedDirectoryUri) {
      const fileName = `${paper.subject}-${paper.year}-${Date.now()}`
        .replace(/[^A-Za-z0-9._-]/g, '_')
        .slice(0, 120);
      const destinationUri = await FileSystem.StorageAccessFramework.createFileAsync(
        selectedDirectoryUri,
        fileName,
        'application/pdf',
      );
      const contents = await FileSystem.readAsStringAsync(temporaryFileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.StorageAccessFramework.writeAsStringAsync(destinationUri, contents, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('The system sharing options are unavailable on this device.');
      }
      await Sharing.shareAsync(temporaryFileUri, {
        mimeType: 'application/pdf',
        dialogTitle: `Save ${paper.subject}`,
        UTI: 'com.adobe.pdf',
      });
    }

    await request(`/api/papers/${paper.id}/downloads`, { method: 'POST' });
    refresh();
    if (Platform.OS === 'android') {
      Alert.alert('PDF downloaded', 'The PDF was saved to the folder you selected.');
    }
  } catch (error) {
    Alert.alert('Could not download paper', error.message);
  } finally {
    if (temporaryFileUri) {
      await removeTemporaryDownload(temporaryFileUri);
    }
  }
}

async function sharePaper(paper) {
  let temporaryFileUri;
  try {
    temporaryFileUri = await downloadPaperFile(paper);
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing is unavailable on this device.');
    }
    await Sharing.shareAsync(temporaryFileUri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share ${paper.subject}`,
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    Alert.alert('Could not share paper', error.message);
  } finally {
    if (temporaryFileUri) {
      await removeTemporaryDownload(temporaryFileUri);
    }
  }
}

async function removeTemporaryDownload(uri) {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    Alert.alert('Could not remove temporary download', error.message);
  }
}

export default function App() {
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const [tab, setTab] = useState('Home');
  const [user, setUser] = useState(null);
  const [papers, setPapers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [browseDepartment, setBrowseDepartment] = useState('');
  const [browseSearch, setBrowseSearch] = useState('');
  const [welcomeComplete, setWelcomeComplete] = useState(null);
  const [launchSplashVisible, setLaunchSplashVisible] = useState(true);

  const refresh = useCallback(() => setRefreshVersion((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(WELCOME_COMPLETE_KEY)
      .then((value) => {
        if (active) setWelcomeComplete(value === 'true');
      })
      .catch((error) => {
        if (active) {
          setNotice(`Could not load welcome screen preference: ${error.message}`);
          setWelcomeComplete(true);
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setLaunchSplashVisible(false), LAUNCH_SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  function openBrowse(search = '', departmentId = '') {
    setBrowseSearch(search);
    setBrowseDepartment(departmentId);
    setTab('Browse');
  }

  useEffect(() => {
    let active = true;
    getStoredUser()
      .then((storedUser) => {
        if (active) setUser(storedUser);
      })
      .catch((error) => {
        if (active) setNotice(`Session ended: ${error.message}`);
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLibraryLoading(true);
    setLibraryError('');
    Promise.all([request('/api/papers'), request('/api/departments')])
      .then(([nextPapers, nextDepartments]) => {
        if (active) {
          setPapers(nextPapers);
          setDepartments(nextDepartments);
          setLibraryError('');
          setNotice('');
        }
      })
      .catch((error) => {
        if (active) setLibraryError(error.message);
      })
      .finally(() => {
        if (active) setLibraryLoading(false);
      });
    return () => { active = false; };
  }, [refreshVersion]);

  useEffect(() => {
    let active = true;
    if (user) {
      request('/api/favorites')
        .then((items) => { if (active) setFavorites(items); })
        .catch((error) => { if (active) setNotice(`Could not load favorites: ${error.message}`); });
    } else {
      setFavorites([]);
    }
    return () => { active = false; };
  }, [user, refreshVersion]);

  async function handleLogin(email, password, expectedAccountType) {
    setLoading(true);
    try {
      const loggedInUser = await signIn(email, password, expectedAccountType);
      setUser(loggedInUser);
      setNotice('');
      setTab('Account');
      refresh();
    } catch (error) {
      setNotice('');
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(
    name,
    email,
    password,
    accountType,
    instituteName,
    instituteDetails,
    readerPreferences,
  ) {
    setLoading(true);
    try {
      const registeredUser = await register(
        name,
        email,
        password,
        accountType,
        instituteName,
        instituteDetails,
        readerPreferences,
      );
      setNotice('');
      setTab('Account');
      if (accountType === 'institute') {
        setUser(null);
      } else {
        setUser(registeredUser);
        refresh();
      }
      return true;
    } catch (error) {
      setNotice(error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    Alert.alert('Sign out?', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            setUser(null);
            setTab('Home');
          } catch (error) {
            Alert.alert('Could not sign out', error.message);
          }
        },
      },
    ]);
  }

  async function finishWelcome() {
    try {
      await SecureStore.setItemAsync(WELCOME_COMPLETE_KEY, 'true');
    } catch (error) {
      setNotice(`Could not save welcome screen preference: ${error.message}`);
    }
    setWelcomeComplete(true);
  }

  async function toggleFavorite(paperId) {
    if (!user) {
      setNotice('Sign in to save favorite papers.');
      setTab('Account');
      return;
    }
    try {
      const result = await request(`/api/favorites/${paperId}`, { method: 'POST' });
      setFavorites((current) => result.favorited
        ? [...current, paperId]
        : current.filter((id) => id !== paperId));
    } catch (error) {
      setNotice(`Could not update favorite: ${error.message}`);
    }
  }

  let screen;
  if (tab === 'Home') {
    screen = (
      <HomeScreen
        papers={papers}
        departments={departments}
        user={user}
        onPreferencesSaved={setUser}
        onBrowse={() => openBrowse()}
        onBrowseDepartment={(departmentId) => openBrowse('', departmentId)}
        onSearch={(search) => openBrowse(search)}
        onMockTest={() => setTab('Mock Test')}
        onSignIn={() => setTab('Account')}
        onOpenPaper={(paper) => openPaper(paper, refresh)}
        compact={compact}
        onMaterials={() => setTab('Materials')}
        libraryLoading={libraryLoading}
        libraryError={libraryError}
        onRetryLibrary={refresh}
        sessionLoading={sessionLoading}
      />
    );
  } else if (tab === 'Browse') {
    screen = (
      <BrowseScreen
        papers={papers}
        departments={departments}
        user={user}
        favorites={favorites}
        initialDepartment={browseDepartment}
        initialSearch={browseSearch}
        onFavorite={toggleFavorite}
        refresh={refresh}
        clearNotice={() => setNotice('')}
        compact={compact}
        libraryLoading={libraryLoading}
        libraryError={libraryError}
        onRetryLibrary={refresh}
      />
    );
  } else if (tab === 'Mock Test' && user?.role === 'user') {
    screen = (
      <MockTestScreen
        papers={papers}
        user={user}
        libraryLoading={libraryLoading}
        libraryError={libraryError}
        onRetryLibrary={refresh}
      />
    );
  } else if (
    tab === 'Materials'
    && user
    && (user.role === 'user' || (user.role === 'institute' && user.approvalStatus === 'approved'))
  ) {
    screen = <StudyMaterialsScreen user={user} />;
  } else {
    screen = (
      <AccountScreen
        user={user}
        loading={loading}
        sessionLoading={sessionLoading}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onLogout={handleLogout}
        onAccountRefreshed={setUser}
        onDepartmentCreated={(department) => {
          setDepartments((current) => (
            current.some((item) => item.id === department.id)
              ? current
              : [...current, department].sort((first, second) => first.name.localeCompare(second.name))
          ));
        }}
        departments={departments}
        papers={papers}
        refresh={refresh}
        libraryLoading={libraryLoading}
        libraryError={libraryError}
        onRetryLibrary={refresh}
      />
    );
  }

  const navigationTabs = user?.role === 'user'
    ? ['Home', 'Browse', 'Mock Test', 'Materials', 'Account']
    : user?.role === 'institute' && user.approvalStatus === 'approved'
      ? ['Home', 'Browse', 'Materials', 'Account']
      : ['Home', 'Browse', 'Account'];

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        {launchSplashVisible || welcomeComplete === null ? (
          <LaunchSplash />
        ) : !welcomeComplete ? (
          <WelcomeScreen onGetStarted={finishWelcome} />
        ) : (
          <>
        <View style={[styles.header, compact && styles.headerCompact]}>
          <View style={styles.headerContent}>
            <View style={styles.brandRow}>
              <Image source={require('./notes-logo.png')} style={styles.logo} resizeMode="contain" />
              <View style={styles.brandInfo}>
                <Text style={styles.brand}>NAGALAND</Text>
                <Text style={styles.headerCaption}>CAMPUS NOTES</Text>
              </View>
            </View>
            {user ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open profile for ${user.name}`}
                onPress={() => setTab('Account')}
                style={({ pressed }) => [styles.headerProfileButton, pressed && styles.pressed]}
              >
                <Text style={styles.headerProfileInitial}>{user.name.trim().charAt(0).toUpperCase()}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={styles.noticeContainer}>
          <Notice message={notice} onDismiss={() => setNotice('')} />
        </View>
        <View style={styles.body}>{screen}</View>
        <View style={styles.tabs}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.tabsScroll, { width: Math.max(width, navigationTabs.length * 56 + 8) }]}
          >
            {navigationTabs.map((item) => {
              const selected = tab === item;
              const label = item === 'Browse'
                ? 'Discover'
                : item === 'Mock Test'
                  ? 'Practice'
                  : item === 'Account'
                    ? 'Profile'
                    : item;
              return (
                <Pressable
                  key={item}
                  style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
                  onPress={() => setTab(item)}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.tabIconWrap, selected && styles.activeTabIconWrap]}>
                    <Text style={[styles.tabIcon, selected && styles.activeTabIcon]}>
                      {TAB_ICONS[item]}
                    </Text>
                  </View>
                  <Text style={[styles.tabText, selected && styles.activeTabText]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.pale },
  launchSplash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF6F8' },
  launchSplashContent: { alignItems: 'center' },
  launchSplashLogo: { width: 190, height: 190 },
  launchSplashTitle: { marginTop: 12, color: COLORS.ink, fontSize: 23, fontWeight: '900', letterSpacing: 2 },
  launchSplashSubtitle: { marginTop: 2, color: COLORS.forest, fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },
  launchSplashTagline: { marginTop: 12, color: COLORS.muted, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  pageLoading: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  welcomeScreen: { flex: 1, overflow: 'hidden', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 32, paddingBottom: 28, backgroundColor: '#CDEAF7' },
  welcomeSky: { ...StyleSheet.absoluteFillObject, backgroundColor: '#CDEAF7' },
  welcomeHillBack: { position: 'absolute', width: '150%', height: '43%', left: '-25%', bottom: '6%', borderTopLeftRadius: 260, borderTopRightRadius: 220, backgroundColor: '#7BBFA8', transform: [{ rotate: '-8deg' }] },
  welcomeHillMiddle: { position: 'absolute', width: '140%', height: '34%', left: '-20%', bottom: '1%', borderTopLeftRadius: 220, borderTopRightRadius: 250, backgroundColor: '#3C8A68', transform: [{ rotate: '7deg' }] },
  welcomeHillFront: { position: 'absolute', width: '150%', height: '25%', left: '-25%', bottom: '-9%', borderTopLeftRadius: 240, borderTopRightRadius: 210, backgroundColor: COLORS.forest, transform: [{ rotate: '-4deg' }] },
  welcomeContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingBottom: 16 },
  welcomeLogoFrame: { width: '82%', maxWidth: 300, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 30, backgroundColor: COLORS.white, elevation: 8, shadowColor: '#0b2d50', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  welcomeLogo: { width: '100%', height: '100%' },
  welcomeTagline: { color: COLORS.white, fontSize: 17, fontWeight: '700', letterSpacing: 0.7, textShadowColor: '#0b2d50', textShadowRadius: 5 },
  welcomeFooter: { alignItems: 'center', gap: 22 },
  welcomeButton: { width: '78%', minHeight: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 32, borderWidth: 1, borderColor: '#ffffffb8', backgroundColor: COLORS.forest },
  welcomeButtonText: { color: COLORS.white, fontSize: 17, fontWeight: '800' },
  welcomeDots: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  welcomeDotActive: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.white },
  welcomeDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: '#ffffffcc', backgroundColor: '#ffffff42' },
  keyboardContainer: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 9, backgroundColor: COLORS.glass, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder },
  headerCompact: { paddingHorizontal: 12, paddingVertical: 8 },
  headerContent: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 48, height: 48 },
  brandInfo: { flex: 1 },
  brand: { fontSize: 16, fontWeight: '900', letterSpacing: 0.4, color: COLORS.ink },
  headerCaption: { color: COLORS.forest, fontSize: 12, fontWeight: '800', letterSpacing: 0.7, marginTop: 1 },
  headerProfileButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: DESIGN_TOKENS.radius.pill, backgroundColor: COLORS.forestPale, borderWidth: 1, borderColor: '#CBE3D5' },
  headerProfileInitial: { color: COLORS.forest, fontSize: 17, fontWeight: '800' },
  body: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: DESIGN_TOKENS.spacing.md, paddingTop: DESIGN_TOKENS.spacing.md, paddingBottom: 28, gap: DESIGN_TOKENS.spacing.md },
  hero: { backgroundColor: COLORS.ink, borderRadius: 18, padding: 20, gap: 12 },
  heroCompact: { padding: 16, gap: 10 },
  eyebrow: { color: '#9cb7ff', fontWeight: '800', letterSpacing: 2 },
  heroTitle: { color: COLORS.white, fontWeight: '800', fontSize: 28, lineHeight: 34 },
  heroTitleCompact: { fontSize: 25, lineHeight: 30 },
  heroCopy: { color: '#d1d9e7', fontSize: 15, lineHeight: 22, marginBottom: 4 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flex: 1, minWidth: 82, padding: 10, borderRadius: 12, backgroundColor: COLORS.white, alignItems: 'center' },
  statValue: { color: COLORS.ink, fontSize: 21, fontWeight: '800' },
  homeContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 32, gap: 16 },
  homeGreeting: { gap: 3, paddingTop: 2 },
  homeGreetingTitle: { color: COLORS.ink, fontSize: 22, fontWeight: '900' },
  homeGreetingCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  homeHero: { minHeight: 205, overflow: 'hidden', position: 'relative', backgroundColor: '#E4F3EB', borderRadius: DESIGN_TOKENS.radius.panel, padding: 18, borderWidth: 1, borderColor: '#D6E9DD', ...SURFACE_SHADOW },
  homeHeroWithImage: { backgroundColor: COLORS.ink, borderColor: '#dcebe0' },
  homeHeroCompact: { minHeight: 195, padding: 15 },
  homeHeroImage: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  homeHeroImageOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 0, backgroundColor: '#0b2d50a8' },
  homeHeroDecorations: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  homeHeroContent: { position: 'relative', zIndex: 1, alignItems: 'stretch', gap: 10 },
  bannerSun: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5c65e', top: 24, right: 35, opacity: 0.9 },
  bannerMountain: { position: 'absolute', width: 0, height: 0, borderLeftWidth: 90, borderRightWidth: 90, borderBottomWidth: 112, borderLeftColor: 'transparent', borderRightColor: 'transparent', bottom: 29 },
  bannerMountainBack: { right: -14, borderBottomColor: '#c4dfce', opacity: 0.8 },
  bannerMountainMiddle: { right: 43, borderLeftWidth: 74, borderRightWidth: 74, borderBottomWidth: 90, borderBottomColor: '#b0d3bd', opacity: 0.86 },
  bannerMountainFront: { right: 102, borderLeftWidth: 58, borderRightWidth: 58, borderBottomWidth: 70, borderBottomColor: '#d0e6d6', opacity: 0.92 },
  bannerLandscape: { position: 'absolute', width: 330, height: 76, right: -110, bottom: -42, borderRadius: 165, backgroundColor: '#b9dbc5', transform: [{ rotate: '-8deg' }] },
  bannerLandscapeFront: { position: 'absolute', width: 310, height: 64, right: 30, bottom: -48, borderRadius: 155, backgroundColor: '#d0e6d6', transform: [{ rotate: '8deg' }] },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#ffffffa8', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 },
  heroBadgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.gold },
  heroBadgeText: { color: COLORS.forest, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  heroBadgeTextOnImage: { color: COLORS.white },
  heroBookMark: { width: 34, height: 34, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', color: COLORS.forest, fontSize: 12, fontWeight: '900', borderRadius: 12, backgroundColor: '#ffffffa8' },
  heroBookMarkOnImage: { color: COLORS.gold, backgroundColor: '#ffffff1c' },
  homeHeroTitle: { alignSelf: 'stretch', color: COLORS.ink, fontSize: 27, lineHeight: 32, fontWeight: '900', letterSpacing: -0.4, marginTop: 2 },
  homeHeroTitleCompact: { fontSize: 24, lineHeight: 29 },
  homeHeroTitleOnImage: { color: COLORS.white },
  homeHeroCopy: { alignSelf: 'stretch', color: '#3f6555', fontSize: 13, lineHeight: 19 },
  homeHeroCopyOnImage: { color: '#f0f5f9' },
  bannerImageNotice: { alignSelf: 'flex-start', color: COLORS.white, backgroundColor: '#142b3bcc', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11 },
  bannerError: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#edcfcc', backgroundColor: '#fff7f6' },
  bannerErrorText: { flex: 1, minWidth: 180, color: COLORS.red, fontSize: 13, lineHeight: 19 },
  libraryLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: COLORS.glass },
  libraryError: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#edcfcc', backgroundColor: '#fff7f6' },
  libraryErrorText: { flex: 1, minWidth: 180, color: COLORS.red, fontSize: 13, lineHeight: 19 },
  homeHeroButton: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: COLORS.forest, borderRadius: 12, paddingHorizontal: 15, marginTop: 1 },
  homeHeroButtonOnImage: { backgroundColor: COLORS.white },
  homeHeroButtonText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  homeHeroButtonTextOnImage: { color: COLORS.forest },
  homeHeroButtonArrow: { color: COLORS.forest, fontSize: 25, fontWeight: '500', marginTop: -3 },
  homeSearchCard: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 5, paddingLeft: 13, backgroundColor: COLORS.glass, borderRadius: DESIGN_TOKENS.radius.card, borderWidth: 1, borderColor: COLORS.glassBorder, ...SURFACE_SHADOW },
  homeSearchIconText: { color: COLORS.muted, fontSize: 22, fontWeight: '700' },
  homeSearchInput: { flex: 1, minWidth: 0, color: COLORS.ink, fontSize: 14, paddingVertical: 9 },
  homeSearchClear: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  homeSearchClearText: { color: COLORS.muted, fontSize: 22 },
  homeSearchButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: COLORS.forest },
  homeSearchButtonText: { color: COLORS.white, fontSize: 24, fontWeight: '700' },
  quickAccessSection: { gap: 10 },
  quickAccessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickAccessCard: { flexGrow: 1, flexBasis: '47%', minWidth: 130, minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: DESIGN_TOKENS.radius.card, borderWidth: 1, borderColor: COLORS.glassBorder, backgroundColor: COLORS.glass, ...SURFACE_SHADOW },
  quickAccessIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: DESIGN_TOKENS.radius.control },
  quickAccessIconBlue: { backgroundColor: '#E6EEFC' },
  quickAccessIconGreen: { backgroundColor: '#E3F3EA' },
  quickAccessIconGold: { backgroundColor: '#FFF2D3' },
  quickAccessIconTeal: { backgroundColor: '#DDF4F0' },
  quickAccessIconText: { fontSize: 20, fontWeight: '800' },
  quickAccessIconTextBlue: { color: COLORS.blue },
  quickAccessIconTextGreen: { color: COLORS.forest },
  quickAccessIconTextGold: { color: '#A96B00' },
  quickAccessIconTextTeal: { color: COLORS.teal },
  quickAccessCopy: { flex: 1, minWidth: 0, gap: 3 },
  quickAccessTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  quickAccessDescription: { color: COLORS.muted, fontSize: 10, lineHeight: 14 },
  quickAccessArrow: { color: COLORS.muted, fontSize: 23, lineHeight: 25 },
  homeQuickFilters: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
  homeQuickFilter: { minHeight: 42, maxWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  homeQuickFilterIcon: { color: COLORS.ink, fontSize: 14 },
  homeQuickFilterText: { flexShrink: 1, color: COLORS.ink, fontSize: 12, fontWeight: '700' },
  homeQuickFilterSelected: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22, backgroundColor: COLORS.forest },
  homeQuickFilterSelectedText: { color: COLORS.white, fontSize: 12, fontWeight: '800' },
  homeSubjectsGrid: { flexDirection: 'row', gap: 8 },
  homeSubjectCard: { flex: 1, minWidth: 0, minHeight: 106, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  homeSubjectCard0: { backgroundColor: '#eef5ff' },
  homeSubjectCard1: { backgroundColor: '#eef7f2' },
  homeSubjectCard2: { backgroundColor: '#fff6e8' },
  homeSubjectCard3: { backgroundColor: '#f0f3f8' },
  homeSubjectIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#dce9fb' },
  homeSubjectIcon0: { backgroundColor: '#dce9fb' },
  homeSubjectIcon1: { backgroundColor: '#d9eee4' },
  homeSubjectIcon2: { backgroundColor: '#ffebc8' },
  homeSubjectIcon3: { backgroundColor: '#dfe6ef' },
  homeSubjectIconText: { color: COLORS.ink, fontSize: 22, fontWeight: '800' },
  homeSubjectName: { color: COLORS.ink, fontSize: 11, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
  homeMockCard: { padding: 16, borderRadius: 18, backgroundColor: COLORS.goldPale, borderWidth: 1, borderColor: '#eadcae', gap: 11 },
  homeMockCopy: { gap: 4 },
  homeMockTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800' },
  homeMockDescription: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  homeSectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 1 },
  homeSectionTitle: { ...DESIGN_TOKENS.typography.sectionTitle, color: COLORS.ink, letterSpacing: -0.3 },
  homeSectionCaption: { ...DESIGN_TOKENS.typography.caption, color: COLORS.muted, marginTop: 3 },
  homePreferenceCard: { padding: 16, borderRadius: 20, backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#e2e9f5', gap: 8 },
  homePreferenceIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#edf2ff' },
  homePreferenceIconText: { color: COLORS.blue, fontSize: 18, fontWeight: '900' },
  homePreferenceFootnote: { color: '#8995a9', fontSize: 11, lineHeight: 16 },
  recommendationSparkle: { color: '#e99b40', fontSize: 23 },
  recommendedPaperIcon: { backgroundColor: '#eff8f3' },
  recommendedPaperIconText: { color: '#319768', fontSize: 17 },
  homeRecommendationEmpty: { paddingHorizontal: 15, paddingVertical: 17, borderRadius: 16, backgroundColor: '#f1f5fb' },
  homeRecommendationEmptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  homeRecentHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  seeAllButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingLeft: 10 },
  seeAllText: { color: COLORS.blue, fontSize: 12, fontWeight: '800' },
  seeAllArrow: { color: COLORS.blue, fontSize: 22, lineHeight: 23 },
  homePaperCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 12, borderRadius: DESIGN_TOKENS.radius.card, backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder, ...SURFACE_SHADOW },
  paperIcon: { width: 43, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#fff0ef' },
  paperIconText: { color: '#d85a54', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  homePaperInfo: { flex: 1, gap: 6 },
  homePaperTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  homePaperMeta: { color: COLORS.muted, fontSize: 11 },
  homePaperArrow: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#f3f6fc' },
  homePaperArrowText: { color: COLORS.blue, fontSize: 24, lineHeight: 26, marginTop: -2 },
  disabledArrow: { color: '#aeb7c7' },
  mockScore: { color: COLORS.blue, fontSize: 28, fontWeight: '900' },
  mockSetupSummary: { gap: 5, padding: 12, borderRadius: 12, backgroundColor: COLORS.pale, borderWidth: 1, borderColor: COLORS.border },
  mockSetupTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  mockSetupText: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  mockGenerating: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: COLORS.forestPale },
  mockQuestionTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  mockOption: { padding: 13, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.white },
  mockOptionSelected: { borderColor: COLORS.blue, backgroundColor: '#edf2ff' },
  mockOptionText: { color: COLORS.ink, fontSize: 14, lineHeight: 20 },
  mockOptionTextSelected: { color: COLORS.blue, fontWeight: '700' },
  mockCorrect: { color: '#258052', fontWeight: '700' },
  mockIncorrect: { color: COLORS.red, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  homeEmptyCard: { alignItems: 'center', padding: 22, borderRadius: 20, backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#e9edf5', gap: 9 },
  emptyBookIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#edf2ff' },
  emptyBookIconText: { color: COLORS.blue, fontWeight: '900', fontSize: 14 },
  homeEmptyTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  homeEmptyCopy: { color: COLORS.muted, textAlign: 'center', fontSize: 12, lineHeight: 18 },
  homeBottomNote: { alignItems: 'center', paddingVertical: 5 },
  homeBottomNoteText: { color: '#929db0', fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  discoverHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  discoverHeadingCopy: { flex: 1, gap: 3 },
  discoverCount: { minWidth: 62, minHeight: 58, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 9, borderRadius: 15, backgroundColor: COLORS.forestPale, borderWidth: 1, borderColor: '#d5e5d9' },
  discoverCountValue: { color: COLORS.forest, fontSize: 19, lineHeight: 22, fontWeight: '800' },
  discoverCountLabel: { color: COLORS.forest, fontSize: 11, fontWeight: '600' },
  discoverSearchCard: { padding: 14, borderRadius: DESIGN_TOKENS.radius.card, backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder, gap: 6, ...SURFACE_SHADOW },
  searchInputRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#b9cbbd', borderRadius: 13, backgroundColor: '#fbfcfa' },
  searchIcon: { color: COLORS.forest, fontSize: 25, fontWeight: '700', lineHeight: 28 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 9, color: COLORS.ink, fontSize: 16 },
  searchClear: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: COLORS.forestPale },
  searchClearText: { color: COLORS.forest, fontSize: 23, lineHeight: 25 },
  discoverHint: { color: COLORS.muted, fontSize: 12, lineHeight: 17 },
  discoverToolbar: { minHeight: 46, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#cbdccf', backgroundColor: COLORS.forestPale },
  filterChipText: { flexShrink: 1, color: COLORS.forest, fontSize: 12, fontWeight: '700' },
  filterChipRemove: { color: COLORS.forest, fontSize: 20, fontWeight: '700' },
  savedShortcut: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  savedShortcutSelected: { borderColor: COLORS.gold, backgroundColor: COLORS.goldPale },
  savedShortcutText: { color: COLORS.ink, fontWeight: '700' },
  savedShortcutTextSelected: { color: COLORS.ink },
  filterToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  filterToggleText: { color: COLORS.ink, fontWeight: '700' },
  filterBadge: { minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderRadius: 11, backgroundColor: COLORS.goldPale },
  filterBadgeText: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  filterChevron: { color: COLORS.forest, fontSize: 18, fontWeight: '800' },
  filterPanel: { padding: 14, gap: 10, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fbfcfa' },
  discoverResultsHeading: { minHeight: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  discoverResultHint: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  refreshButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: COLORS.forestPale },
  refreshButtonText: { color: COLORS.forest, fontWeight: '700' },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  sortLabel: { color: COLORS.muted, fontSize: 13, fontWeight: '700', marginRight: 2 },
  sortOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  sortOptionSelected: { borderColor: COLORS.forest, backgroundColor: COLORS.forestPale },
  sortOptionText: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  sortOptionTextSelected: { color: COLORS.forest, fontWeight: '800' },
  discoverEmpty: { alignItems: 'center', padding: 20, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  discoverEmptyIcon: { color: COLORS.gold, fontSize: 34, lineHeight: 40, fontWeight: '700' },
  paperCard: { width: '100%', padding: 15, borderRadius: DESIGN_TOKENS.radius.card, backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder, gap: 10, ...SURFACE_SHADOW },
  paperCardTitle: { flex: 1, color: COLORS.ink, fontSize: 17, lineHeight: 23, fontWeight: '800' },
  paperSaveButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: COLORS.goldPale },
  paperMetaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  paperMetaChip: { color: COLORS.forest, fontSize: 11, lineHeight: 15, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: COLORS.forestPale },
  paperExamType: { color: COLORS.ink, fontWeight: '700' },
  paperCode: { color: COLORS.muted, fontSize: 12 },
  paperUsage: { color: COLORS.muted, fontSize: 12, paddingTop: 2, borderTopWidth: 1, borderTopColor: COLORS.border },
  profileCard: { width: '100%', backgroundColor: COLORS.glass, borderRadius: DESIGN_TOKENS.radius.card, padding: 16, borderWidth: 1, borderColor: COLORS.glassBorder, gap: 12, ...SURFACE_SHADOW },
  profileAvatar: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: COLORS.forestPale, borderWidth: 1, borderColor: '#cbdccf' },
  profileAvatarText: { color: COLORS.forest, fontSize: 23, fontWeight: '800' },
  profileIdentity: { gap: 3 },
  profileRole: { alignSelf: 'flex-start', color: COLORS.forest, backgroundColor: COLORS.forestPale, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, fontSize: 12, fontWeight: '700' },
  profileDetails: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  profileDetailText: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  approvalBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: COLORS.goldPale },
  approvalBadgeApproved: { backgroundColor: COLORS.forestPale },
  approvalBadgeRejected: { backgroundColor: '#fceeed' },
  approvalBadgeText: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  rejectionNotice: { padding: 12, borderRadius: 12, backgroundColor: '#fceeed', gap: 4 },
  rejectionNoticeTitle: { color: COLORS.red, fontWeight: '800' },
  rejectionNoticeText: { color: COLORS.ink, lineHeight: 20 },
  uploadStatus: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: COLORS.forestPale },
  uploadStatusText: { flex: 1, color: COLORS.forest, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  successText: { color: COLORS.forest, backgroundColor: COLORS.forestPale, padding: 10, borderRadius: 10, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  sectionTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '700', marginTop: 8 },
  screenTitle: { ...DESIGN_TOKENS.typography.screenTitle, color: COLORS.ink, marginBottom: 2 },
  card: { width: '100%', backgroundColor: COLORS.glass, borderRadius: DESIGN_TOKENS.radius.card, padding: 14, borderWidth: 1, borderColor: COLORS.glassBorder, gap: 8, ...SURFACE_SHADOW },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: COLORS.ink, flexShrink: 1 },
  muted: { ...DESIGN_TOKENS.typography.body, color: COLORS.muted },
  description: { color: COLORS.ink, lineHeight: 20 },
  label: { color: COLORS.ink, fontWeight: '600', marginBottom: 5 },
  field: { width: '100%', minWidth: 0, marginTop: 3 },
  input: { width: '100%', minWidth: 0, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.glass, borderRadius: DESIGN_TOKENS.radius.control, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: COLORS.ink },
  passwordInputRow: { width: '100%', minWidth: 0, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, borderRadius: 9 },
  passwordInput: { flex: 1, width: 'auto', borderWidth: 0, backgroundColor: 'transparent' },
  passwordToggle: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  passwordToggleText: { color: COLORS.blue, fontWeight: '700' },
  passwordHint: { color: COLORS.muted, fontSize: 13, lineHeight: 18 },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  picker: { width: '100%', minWidth: 0, borderWidth: 1, borderColor: COLORS.border, borderRadius: 9, backgroundColor: COLORS.white, overflow: 'hidden' },
  button: { backgroundColor: COLORS.forest, borderRadius: DESIGN_TOKENS.radius.control, minHeight: 48, paddingHorizontal: 16, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  buttonText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  secondaryButton: { backgroundColor: COLORS.forestPale, borderWidth: 1, borderColor: '#cbdccf' },
  secondaryButtonText: { color: COLORS.forest },
  destructiveButton: { backgroundColor: '#fff7f6', borderColor: '#edcfcc' },
  destructiveButtonText: { color: COLORS.red },
  compactButton: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 12 },
  disabledButton: { opacity: 0.55 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  inlineDepartmentForm: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: COLORS.pale },
  favorite: { color: '#e19b1b', fontSize: 26 },
  link: { color: COLORS.blue, fontWeight: '700' },
  authSwitch: { alignItems: 'center', paddingVertical: 8 },
  registrationProgress: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: COLORS.pale },
  registrationProgressText: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  registrationProgressTrack: { height: 6, overflow: 'hidden', borderRadius: 3, backgroundColor: COLORS.border },
  registrationProgressFill: { width: '50%', height: '100%', borderRadius: 3, backgroundColor: COLORS.forest },
  registrationProgressComplete: { width: '100%' },
  errorText: { color: COLORS.red, fontSize: 13 },
  badge: { alignSelf: 'flex-start', textTransform: 'capitalize', color: COLORS.forest, backgroundColor: COLORS.forestPale, borderRadius: 20, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 10 },
  filterColumn: { flexDirection: 'column' },
  filterHalf: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  selectedChip: { backgroundColor: COLORS.forest, borderColor: COLORS.forest },
  chipText: { color: COLORS.ink, fontSize: 12 },
  selectedChipText: { color: COLORS.white, fontWeight: '700' },
  empty: { padding: 25, alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12 },
  noticeContainer: { paddingHorizontal: 12 },
  notice: { backgroundColor: COLORS.goldPale, borderRadius: 12, padding: 12, gap: 4 },
  noticeText: { color: COLORS.ink },
  noticeDismiss: { color: COLORS.forest, fontWeight: '700' },
  tabs: { backgroundColor: COLORS.glass, borderTopWidth: 1, borderTopColor: COLORS.glassBorder, ...SURFACE_SHADOW },
  tabsScroll: { minHeight: 68, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 4, paddingTop: 5, paddingBottom: 4 },
  tab: { flex: 1, minWidth: 56, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2, paddingVertical: 4, borderRadius: 14 },
  tabIconWrap: { width: 31, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  activeTabIconWrap: { backgroundColor: COLORS.forestPale },
  tabIcon: { color: COLORS.muted, fontSize: 22, lineHeight: 25, fontWeight: '600' },
  activeTabIcon: { color: COLORS.forest, fontWeight: '800' },
  tabText: { maxWidth: '100%', color: COLORS.muted, fontSize: 11, lineHeight: 14, fontWeight: '700', textAlign: 'center' },
  activeTabText: { color: COLORS.forest, fontWeight: '800' },
});
