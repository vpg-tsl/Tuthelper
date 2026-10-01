const { SlashCommandBuilder } = require('discord.js');
const { getState, getStudentsFromSheet } = require('./sheetService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Entre ton numéro étudiant afin que nous puissions confirmer ton statut')
        .addIntegerOption(option =>
            option
                .setName('num')
                .setDescription('Écris ton numéro étudiant')
                .setRequired(true)
        ),

    async execute(interaction) {
        const state = getState();

        // 1. VÉRIFICATION DU SERVEUR ACTIF
        if (!state || !state.activeGuildId || interaction.guildId !== state.activeGuildId) {
            return interaction.reply({
                content: "⚠️ **La vérification des étudiants n'est plus possible pour ce serveur.**\n\nPour rejoindre le nouveau serveur officiel de l'année en cours, veuillez vous rapprocher de l'association à travers ses moyens de communication officiels.",
                flags: 64 // Réponse éphémère
            });
        }

        const member = interaction.member;
        const num = interaction.options.getInteger('num').toString();

        // Rôles étudiants gérés par la vérif
        const studentRoles = ["PASS", "LAS 1", "LAS 2", "LAS 3"];

        // Rôles exclus de la vérif
        const excludedRoles = ["Bureau", "Tuteur", "Fossile Actif", "Bureau Restreint"];

        // 2. Vérifie si le membre a un rôle exclu
        const hasExcludedRole = member.roles.cache.some(r => excludedRoles.includes(r.name));
        if (hasExcludedRole) {
            return interaction.reply({
                content: "❌ Vous n'avez pas besoin de passer par la vérification (rôle spécial détecté).",
                flags: 64
            });
        }

        // 3. Vérifie si la personne a déjà un rôle étudiant
        const existingRole = member.roles.cache.find(r => studentRoles.includes(r.name));
        if (existingRole) {
            return interaction.reply({
                content: `✅ Vous êtes déjà vérifié(e) dans la filière **${existingRole.name}**. Vous n’avez plus besoin de refaire la commande.`,
                flags: 64
            });
        }

        await interaction.deferReply({ flags: 64 });

        // 4. Liste exacte des onglets présents dans le Google Sheet
        const sheetTabs = [
            { tab: "PASS Brabois", role: "PASS", site: "Brabois" },
            { tab: "PASS Bridoux", role: "PASS", site: "Bridoux" },
            { tab: "LAS 1 Brabois", role: "LAS 1", site: "Brabois" },
            { tab: "LAS 1 Bridoux", role: "LAS 1", site: "Bridoux" },
            { tab: "LAS 2 Brabois", role: "LAS 2", site: "Brabois" },
            { tab: "LAS 2 Bridoux", role: "LAS 2", site: "Bridoux" },
            { tab: "LAS 3 Brabois", role: "LAS 3", site: "Brabois" },
            { tab: "LAS 3 Bridoux", role: "LAS 3", site: "Bridoux" },
            { tab: "LAS 1", role: "LAS 1" },
            { tab: "LAS 2", role: "LAS 2" },
            { tab: "LAS 3", role: "LAS 3" },
        ];

        let studentFound = null;
        let matchedConfig = null;

        for (const config of sheetTabs) {
            try {
                const sheetData = await getStudentsFromSheet(config.tab);
                const student = sheetData.find(user => user['DOSSIER'] === num);

                if (student) {
                    studentFound = student;
                    matchedConfig = config;
                    break;
                }
            } catch (err) {
                console.error(`Erreur lors de la lecture de l'onglet "${config.tab}" :`, err);
            }
        }

        if (!studentFound || !matchedConfig) {
            return interaction.editReply(
                `❌ Échec de la vérification. Aucun étudiant trouvé avec le numéro **${num}**.\n\n🔄 Merci de **réessayer**.\n📩 Si le problème persiste, contacte un administrateur du serveur ou un membre du Bureau.`
            );
        }

        // 5. Recherche des rôles Discord correspondants
        const rolesToAdd = [];

        // Rôle de Filière (ex: PASS, LAS 1...)
        const mainRole = interaction.guild.roles.cache.find(
            r => r.name.toLowerCase() === matchedConfig.role.toLowerCase()
        );
        if (!mainRole) {
            return interaction.editReply(`❌ Le rôle **${matchedConfig.role}** n'existe pas sur le serveur. Contactez un administrateur.`);
        }
        rolesToAdd.push(mainRole);

        // Rôle de Campus (ex: Brabois, Bridoux)
        const siteRole = interaction.guild.roles.cache.find(
            r => r.name.toLowerCase() === matchedConfig.site.toLowerCase()
        );
        if (siteRole) {
            rolesToAdd.push(siteRole);
        } else {
            console.warn(`[WARNING] Le rôle de campus "${matchedConfig.site}" n'a pas été trouvé sur le serveur Discord.`);
        }

        // Attribution des rôles
        await member.roles.add(rolesToAdd);

        // 6. Mise à jour du pseudo : Prénom N.
        const prenom = studentFound['PRENOM'] || studentFound['PRÉNOM'] || '';
        const nom = studentFound['NOM'] || '';
        const formattedPrenom = prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase();
        const formattedNomInitial = nom.charAt(0).toUpperCase();
        const nickname = `${formattedPrenom} ${formattedNomInitial}.`;

        await member.setNickname(nickname).catch(() => {});

        // 7. Message de confirmation
        const siteMention = siteRole ? ` (Campus **${matchedConfig.site}**)` : '';
        await interaction.editReply(
            `# ✅ Vérification réussie\nBienvenue **${nickname}** en **${matchedConfig.role}**${siteMention} sur le serveur du **Tutorat Santé Lorraine** !`
        );
    },
};
