import { ComposeClient } from '@composedb/client';
import { Box, Flex, LoadingState, useDisclosure } from '@metafam/ds';
import { composeDBDefinition, Maybe } from '@metafam/utils';
import { PageContainer } from 'components/Container';
import { EditableGridLayout } from 'components/EditableGridLayout';
import { PlayerSection } from 'components/Player/PlayerSection';
import { ComposeDBPromptModal } from 'components/Player/Profile/ComposeDBPromptModal';
import {
  ALL_BOXES,
  DEFAULT_PLAYER_LAYOUT_DATA,
} from 'components/Player/Section/config';
import { HeadComponent } from 'components/Seo';
import { CONFIG } from 'config';
import { ComposeDBContextProvider } from 'contexts/ComposeDBContext';
import {
  PlayerHydrationContextProvider,
  usePlayerHydrationContext,
} from 'contexts/PlayerHydrationContext';
import {
  Player,
  useUpdatePlayerProfileLayoutMutation as useUpdateLayout,
} from 'graphql/autogen/types';
import { buildPlayerProfileQuery } from 'graphql/composeDB/queries/profile';
import { getPlayer } from 'graphql/getPlayer';
import { getTopPlayerUsernames } from 'graphql/getPlayers';
import { ComposeDBProfileQueryResult } from 'graphql/types';
import { useProfileField, useUser } from 'lib/hooks';
import { hydratePlayerProfile } from 'lib/hooks/ceramic/useGetPlayerProfileFromComposeDB';
import { GetStaticPaths, GetStaticPropsContext } from 'next';
import { useRouter } from 'next/router';
import Page404 from 'pages/404';
import React, { ReactElement, useCallback, useMemo } from 'react';
import { LayoutData } from 'utils/boxTypes';
import {
  getPlayerBackgroundFull,
  getPlayerBannerFull,
  getPlayerDescription,
  getPlayerImage,
  getPlayerName,
  getPlayerURL,
} from 'utils/playerHelpers';

export const PlayerPage: React.FC<{ player: Player }> = ({
  player,
}): ReactElement => {
  const router = useRouter();

  // TODO create a button that migrates a user's data explicitly from
  // hasura to composeDB. Also use this bannerImageURL for backgroundImageURL
  // if it exists

  if (router.isFallback) {
    return <LoadingState />;
  }

  if (!player) return <Page404 />;

  return (
    <ComposeDBContextProvider>
      <PlayerHydrationContextProvider player={player}>
        <PlayerPageContent />
      </PlayerHydrationContextProvider>
    </ComposeDBContextProvider>
  );
};

export default PlayerPage;

const PlayerPageContent: React.FC = () => {
  const { hydratedPlayer: player, hydrateFromComposeDB } =
    usePlayerHydrationContext();
  const { isOpen, onClose } = useDisclosure({ defaultIsOpen: true });
  const { user, fetching } = useUser();

  const isOwnProfile = useMemo(
    () => !fetching && !!user && user.id === player.id,
    [user, fetching, player.id],
  );

  const handleMigrationCompleted = useCallback(
    (streamID: string) => {
      hydrateFromComposeDB(streamID);
    },
    [hydrateFromComposeDB],
  );

  const { value: bannerURL } = useProfileField({
    field: 'bannerImageURL',
    player,
    getter: getPlayerBannerFull,
  });
  const { value: background } = useProfileField({
    field: 'backgroundImageURL',
    player,
    getter: getPlayerBackgroundFull,
  });

  const banner = background ? '' : bannerURL;

  return (
    <PageContainer
      p={0}
      h="100%"
      position="relative"
      {...(background
        ? {
            bg: `url('${background}') no-repeat`,
            bgSize: 'cover',
            bgPos: 'center',
            bgAttachment: 'fixed',
          }
        : {})}
    >
      <HeadComponent
        title={`MetaGame Profile: ${getPlayerName(player)}`}
        description={(getPlayerDescription(player) ?? '').replace('\n', ' ')}
        url={getPlayerURL(player, { rel: false })}
        img={getPlayerImage(player)}
      />
      {banner != null ? (
        <Box
          bg={`url('${banner}') no-repeat`}
          bgSize="cover"
          bgPos="center"
          h={72}
          pos="absolute"
          w="full"
          top={0}
        />
      ) : null}
      <Flex
        w="full"
        h="min-content"
        direction="column"
        align="center"
        pt={12}
        px={[0, 4, 8]}
        {...(background
          ? {
              bg: `url('${background}') no-repeat`,
              bgSize: 'cover',
              bgPos: 'center',
              bgAttachment: 'fixed',
            }
          : {})}
      >
        <Grid {...{ player, user, isOwnProfile }} />
      </Flex>
      {isOwnProfile && user?.profile && !user.ceramicProfileId ? (
        <ComposeDBPromptModal
          player={user}
          {...{ isOpen, handleMigrationCompleted, onClose }}
        />
      ) : null}
    </PageContainer>
  );
};

type GridProps = {
  player: Player;
  user: Maybe<Player>;
  isOwnProfile: boolean;
};

export const Grid: React.FC<GridProps> = ({
  player,
  user,
  isOwnProfile,
}): ReactElement => {
  const [{ fetching: persisting }, saveLayoutData] = useUpdateLayout();

  const savedLayoutData = useMemo<LayoutData>(
    () =>
      player.profileLayout
        ? JSON.parse(player.profileLayout)
        : DEFAULT_PLAYER_LAYOUT_DATA,
    [player.profileLayout],
  );

  const persistLayoutData = useCallback(
    async (layoutData: LayoutData) => {
      if (!user) throw new Error('User is not set.');

      const { error } = await saveLayoutData({
        playerId: user.id,
        profileLayout: JSON.stringify(layoutData),
      });

      if (error) throw error;
    },
    [saveLayoutData, user],
  );

  return (
    <EditableGridLayout
      {...{
        player,
        defaultLayoutData: DEFAULT_PLAYER_LAYOUT_DATA,
        savedLayoutData,
        showEditButton: isOwnProfile,
        persistLayoutData,
        persisting,
        allBoxOptions: ALL_BOXES,
        displayComponent: PlayerSection,
        pt: isOwnProfile ? 0 : '4rem',
      }}
    />
  );
};

type QueryParams = { username: string };

export const getStaticPaths: GetStaticPaths<QueryParams> = async () => {
  const names = await getTopPlayerUsernames();

  return {
    paths: names
      .map(({ username, address }) => {
        const out = [];
        if (username) {
          out.push({ params: { username } });
        }
        out.push({ params: { username: address } });
        return out;
      })
      .flat(),
    fallback: 'blocking',
  };
};

export const getStaticProps = async (
  context: GetStaticPropsContext<QueryParams>,
) => {
  const username = context.params?.username;

  if (username == null) {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    };
  }

  const player = await getPlayer(username);
  let hydratedPlayer;

  if (player?.ceramicProfileId) {
    const composeDBClient = new ComposeClient({
      ceramic: CONFIG.ceramicURL,
      definition: composeDBDefinition,
    });
    const query = buildPlayerProfileQuery(player.ceramicProfileId);
    const response = await composeDBClient.executeQuery(query);
    if (response.data != null) {
      const composeDBProfileData = (
        response.data as ComposeDBProfileQueryResult
      ).node;
      hydratedPlayer = hydratePlayerProfile(player, composeDBProfileData);
    } else if (response.errors) {
      console.error(response.errors);
    }
  }

  return {
    props: {
      player: hydratedPlayer ?? player ?? null, // must be serializable
      key: username.toLowerCase(),
      hideTopMenu: !player,
    },
    revalidate: 1,
  };
};
