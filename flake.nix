{
  description = "keyoxide-web";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-24.05";
    utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, utils }:
    utils.lib.eachDefaultSystem (system:
      let
        name = "keyoxide-web";
        pkgs = import nixpkgs { inherit system; };
      in
      {
        # nix develop
        devShell = with pkgs; mkShell {
          buildInputs = [
            nodejs_20
          ];

          shellHook = ''
            echo "node: `${nodejs_20}/bin/node --version`"
            echo "npm:  `${nodejs_20}/bin/npm --version`"
          '';
        };
      });
}