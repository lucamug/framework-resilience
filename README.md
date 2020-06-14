# Resilience to errors of front-end frameworks

This is the code for the post "Resilience to errors of front-end frameworks".

An attempt to measure how much framework resists our urge of introducing silly errors here and there.

## Play with the code

Run these commands:

```
npm install
cmd/prepare-svelte
```

Then run these three commands in three different terminals:

```
cmd/start
cmd/start-elm
cmd/start-svelte
```

Now you can check all the versions at

* http://localhost:8000/selected/vanillajs/
* http://localhost:8000/selected/react/
* http://localhost:8000/selected/vue/
* http://localhost:8000/selected/svelte/
* http://localhost:8000/selected/elm/

Not that Elm and Svelte are watching the folder and they recompile the code on save, but the browser need to be refreshed manually.

Everything else works directly without compiling. Also JSX is transformed in browser with the "in-browser JSX transformer".

In the repository you will find 7 branches, from `error-1` to `error-7`. They contain the modified programs used for the examples mentioned in the post.

# Lines of code

Out of curiosity
```
              Html   JSX     JS     Elm   Svelte    Total
---------------------------------------------------------              
   Svelte       20            5              135      160
      Vue       55          128                       183
      Elm       32                  328               360
    React       26   301    106                       433
VanillaJS       50          589                       639
```