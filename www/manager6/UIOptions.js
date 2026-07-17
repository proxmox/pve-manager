Ext.define('PVE.UIOptions', {
    singleton: true,

    options: {
        'allowed-tags': [],
    },

    update: function () {
        Proxmox.Utils.API2Request({
            url: '/cluster/options',
            method: 'GET',
            success: function (response) {
                for (const option of ['allowed-tags', 'console', 'tag-style', 'token-policy']) {
                    PVE.UIOptions.options[option] = response?.result?.data?.[option];
                }

                PVE.UIOptions.updateTagList(PVE.UIOptions.options['allowed-tags']);
                PVE.UIOptions.updateTagSettings(PVE.UIOptions.options['tag-style']);
                PVE.UIOptions.fireUIConfigChanged();
            },
        });
    },

    // milliseconds the server clock is ahead of the local one, estimated from the Date header of
    // the last policy fetch, as the backend checks token lifetimes against its own clock; the
    // header's second precision and the response delay bias it toward earlier dates
    serverTimeOffset: 0,

    serverNow: () => Date.now() + PVE.UIOptions.serverTimeOffset,

    // the token policy can change independently of the tag settings, so refresh only that
    // without triggering the resource store refresh a full update does; await this to act on
    // a current policy
    updateTokenPolicy: async function () {
        try {
            let response = await Proxmox.Async.api2({ url: '/cluster/options', method: 'GET' });
            PVE.UIOptions.options['token-policy'] = response.result?.data?.['token-policy'];
            let serverTime = Date.parse(response.getResponseHeader('Date'));
            PVE.UIOptions.serverTimeOffset = isNaN(serverTime) ? 0 : serverTime - Date.now();
        } catch {
            // best effort, keep the last known policy, the backend enforces it in any case
        }
    },

    tagList: [],

    updateTagList: function (tags) {
        PVE.UIOptions.tagList = [...new Set([...tags])].sort();
    },

    parseTagOverrides: function (overrides) {
        let colors = {};
        (overrides || '').split(';').forEach((color) => {
            if (!color) {
                return;
            }
            let [tag, color_hex, font_hex] = color.split(':');
            let r = parseInt(color_hex.slice(0, 2), 16);
            let g = parseInt(color_hex.slice(2, 4), 16);
            let b = parseInt(color_hex.slice(4, 6), 16);
            colors[tag] = [r, g, b];
            if (font_hex) {
                colors[tag].push(parseInt(font_hex.slice(0, 2), 16));
                colors[tag].push(parseInt(font_hex.slice(2, 4), 16));
                colors[tag].push(parseInt(font_hex.slice(4, 6), 16));
            }
        });
        return colors;
    },

    tagOverrides: {},

    updateTagOverrides: function (colors) {
        let sp = Ext.state.Manager.getProvider();
        let color_state = sp.get('colors', '');
        let browser_colors = PVE.UIOptions.parseTagOverrides(color_state);
        PVE.UIOptions.tagOverrides = Ext.apply({}, browser_colors, colors);
    },

    updateTagSettings: function (style) {
        let overrides = style?.['color-map'];
        PVE.UIOptions.updateTagOverrides(PVE.UIOptions.parseTagOverrides(overrides ?? ''));

        Ext.ComponentQuery.query('pveResourceTree')[0].setUserCls(
            PVE.UIOptions.tagStyleClass(style),
        );
        Ext.ComponentQuery.query('vmselector').forEach((component) => {
            component.setUserCls(PVE.UIOptions.tagStyleClass(style, true));
        });
    },

    tagStyleClass: function (style, replaceNone = false) {
        let shape = style?.shape ?? 'circle';
        if (shape === '__default__' || (shape === 'none' && replaceNone)) {
            shape = 'circle';
        }
        return `proxmox-tags-${shape}`;
    },

    tagTreeStyles: {
        __default__: `${Proxmox.Utils.defaultText} (${gettext('Circle')})`,
        full: gettext('Full'),
        circle: gettext('Circle'),
        dense: gettext('Dense'),
        none: Proxmox.Utils.NoneText,
    },

    tagOrderOptions: {
        __default__: `${Proxmox.Utils.defaultText} (${gettext('Alphabetical')})`,
        config: gettext('Configuration'),
        alphabetical: gettext('Alphabetical'),
    },

    shouldSortTags: function () {
        return !(PVE.UIOptions.options['tag-style']?.ordering === 'config');
    },

    getTreeSortingValue: function (key) {
        let localStorage = Ext.state.Manager.getProvider();
        let browserValues = localStorage.get('pve-tree-sorting');
        let defaults = {
            'sort-field': 'vmid',
            'group-templates': true,
            'group-guest-types': true,
            'nest-pools': true,
        };

        return browserValues?.[key] ?? defaults[key];
    },

    fireUIConfigChanged: function () {
        PVE.data.ResourceStore.refresh();
        Ext.GlobalEvents.fireEvent('loadedUiOptions');
    },
});
