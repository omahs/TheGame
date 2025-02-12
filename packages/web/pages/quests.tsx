import {
  Box,
  Heading,
  HStack,
  InfoIcon,
  LoadingState,
  MetaButton,
  Text,
  Tooltip,
  useToast,
} from '@metafam/ds';
import { Constants } from '@metafam/utils';
import { PageContainer } from 'components/Container';
import { QuestFilter } from 'components/Quest/QuestFilter';
import { QuestList } from 'components/Quest/QuestList';
import { HeadComponent } from 'components/Seo';
import { getSsrClient } from 'graphql/client';
import { getQuests } from 'graphql/getQuests';
import { getPlayerRoles } from 'graphql/queries/enums/getRoles';
import { usePSeedBalance } from 'lib/hooks/balances';
import { useQuestFilter } from 'lib/hooks/quests';
import { InferGetStaticPropsType } from 'next';
import { useRouter } from 'next/router';
import React, { useMemo } from 'react';
import { isAllowedToCreateQuest } from 'utils/questHelpers';

type Props = InferGetStaticPropsType<typeof getStaticProps>;

export const getStaticProps = async () => {
  const roleChoices = await getPlayerRoles();
  const [ssrClient, ssrCache] = getSsrClient();
  // This populates the cache server-side
  await getQuests(undefined, ssrClient);

  return {
    props: {
      urqlState: ssrCache.extractData(),
      roleChoices,
    },
    revalidate: 1,
  };
};

const QuestsPage: React.FC<Props> = ({ roleChoices }) => {
  const router = useRouter();
  const {
    quests,
    aggregates,
    fetching,
    error,
    queryVariables,
    setQueryVariable,
  } = useQuestFilter();
  const { pSeedBalance, fetching: fetchingBalance } = usePSeedBalance();
  const toast = useToast();
  const canCreateQuest = useMemo(
    () => isAllowedToCreateQuest(pSeedBalance),
    [pSeedBalance],
  );

  return (
    <PageContainer>
      <HeadComponent
        title="MetaGame Quests"
        description="MetaGame is a Massive Online Coordination Game! MetaGame has some epic quests going on!"
        url="https://my.metagame.wtf/quests"
      />
      <Box w="100%" maxW="80rem">
        <HStack justify="space-between" w="100%">
          <HStack>
            <Heading as="h1" fontFamily="body" size="2xl">
              Quest Explorer
            </Heading>
            <Tooltip label='Note that there are two quest-related dashboard widgets as well. One for managing submissions for quests you created, and another for viewing your own submissions. Click on "Edit Layout" on the dashboard page to check them out.'>
              <InfoIcon />
            </Tooltip>
          </HStack>
          <Box>
            <Tooltip
              label={
                !canCreateQuest &&
                `You need to hold at least ${Constants.PSEED_FOR_QUEST} pSEED to create a quest.`
              }
            >
              <MetaButton
                isLoading={fetchingBalance}
                onClick={() => {
                  if (!canCreateQuest) {
                    toast({
                      title: 'Error',
                      description: `Insufficient pSEED Balance. Must have ≥ ${Constants.PSEED_FOR_QUEST} pSEED.`,
                      status: 'error',
                      isClosable: true,
                    });
                  } else {
                    router.push('/quest/create');
                  }
                }}
              >
                New Quest
              </MetaButton>
            </Tooltip>
          </Box>
        </HStack>
        <Box mt={8} w="100%">
          <QuestFilter
            quests={quests || []}
            {...{
              roleChoices,
              aggregates,
              queryVariables,
              setQueryVariable,
            }}
          />
        </Box>
        <Box mt={8} w="100%">
          {fetching && <LoadingState />}
          {error && <Text>{`Error: ${error.message}`}</Text>}
          {quests && !fetching && <QuestList {...{ quests }} />}
        </Box>
      </Box>
    </PageContainer>
  );
};

export default QuestsPage;
